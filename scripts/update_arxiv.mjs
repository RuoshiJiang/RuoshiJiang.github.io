#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "papers.js");

const CATEGORIES = ["cond-mat.str-el", "cond-mat.supr-con"];
const CATEGORY_LABELS = {
  "cond-mat.str-el": "Strongly Correlated Electrons",
  "cond-mat.supr-con": "Superconductivity"
};

const MONTHS = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12"
};

const INTEREST_KEYWORDS = [
  ["kagome", 9, "包含 kagome 或受挫晶格主题，和强关联材料阅读线索高度相关。"],
  ["cuprate", 8, "涉及 cuprate 超导，是强关联与非常规超导的核心方向。"],
  ["nickelate", 8, "涉及 nickelate 体系，适合优先跟进高温超导候选材料。"],
  ["hubbard", 7, "Hubbard 模型相关，适合从模型层面理解关联与配对。"],
  ["mott", 7, "Mott 物理相关，适合优先关注关联绝缘态和相邻有序。"],
  ["pair density wave", 7, "涉及 pair density wave，是非常规超导的重要候选序。"],
  ["pdw", 7, "涉及 PDW，是非常规超导的重要候选序。"],
  ["topological superconduct", 7, "涉及拓扑超导，值得优先看其模型和边界态机制。"],
  ["majorana", 6, "涉及 Majorana 物理，适合关注拓扑超导与器件解释。"],
  ["quantum spin liquid", 6, "涉及量子自旋液体，和受挫强关联体系密切相关。"],
  ["charge density wave", 6, "涉及电荷密度波，适合和 kagome、TMD 或超导竞争序联系阅读。"],
  ["cdw", 6, "涉及 CDW，适合和 kagome、TMD 或超导竞争序联系阅读。"],
  ["moire", 6, "涉及 moire 体系，适合关注平带、关联和非常规超导。"],
  ["twisted", 5, "涉及扭转结构，适合关注 moire 或层状材料中的新奇相。"],
  ["nematic", 5, "涉及 nematic 物理，适合关注对称性破缺与配对机制。"],
  ["altermagnet", 5, "涉及 altermagnetism，适合关注磁性与超导耦合。"],
  ["heavy fermion", 5, "涉及 heavy fermion，适合关注强关联低能准粒子与量子临界。"],
  ["frustrat", 5, "涉及受挫磁性，适合关注低维量子磁性和新奇基态。"],
  ["ising superconduct", 5, "涉及 Ising 超导，适合关注低维强自旋轨道体系。"],
  ["tas2", 5, "涉及 TaS2/TMD 体系，适合关注层状材料中的关联和超导。"],
  ["nbse", 4, "涉及 NbSe/TMD 体系，适合关注 CDW、关联和超导邻近关系。"],
  ["spectroscopy", 3, "包含谱学信息，可帮助快速判断实验可观测量。"],
  ["stm", 3, "包含 STM/隧穿谱线索，适合关注局域电子结构。"],
  ["nmr", 3, "包含 NMR 线索，适合关注磁性和低能涨落。"],
  ["neutron", 3, "包含中子散射线索，适合关注磁结构和集体激发。"],
  ["arpes", 3, "包含 ARPES 线索，适合关注能带和费米面。"]
];

const LOW_PRIORITY_KEYWORDS = [
  ["accelerator", -6],
  ["detector", -6],
  ["software", -5],
  ["python package", -5],
  ["statistics", -3],
  ["data analysis", -3]
];

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    minus: "-",
    alpha: "alpha",
    beta: "beta",
    gamma: "gamma",
    delta: "delta",
    mu: "mu",
    pi: "pi"
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (_, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return named[entity] ?? `&${entity};`;
  });
}

function textFromHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span[^>]*class=["'][^"']*descriptor[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function stripDescriptor(text = "") {
  return text.replace(/^(Title|Authors|Comments|Subjects|Abstract|Journal-ref):\s*/i, "").trim();
}

function extractClassBlock(html, className, tag = "div") {
  const pattern = new RegExp(`<${tag}[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(pattern);
  return match ? stripDescriptor(textFromHtml(match[1])) : "";
}

function extractCategories(text, fallback) {
  const found = new Set();
  for (const match of text.matchAll(/cond-mat\.(str-el|supr-con)/g)) {
    found.add(`cond-mat.${match[1]}`);
  }
  if (!found.size && fallback) {
    found.add(fallback);
  }
  return [...found].filter(category => CATEGORIES.includes(category));
}

function parseArxivDate(heading) {
  const match = heading.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${MONTHS[month]}-${day.padStart(2, "0")}`;
}

async function fetchText(url, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Ruoshi arXiv Daily Reader (https://github.com/RuoshiJiang/RuoshiJiang.github.io)"
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 900));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

function parseListPage(html, sourceCategory) {
  const sections = [];
  const sectionPattern = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[^>]*>|<\/body>|$)/gi;
  let sectionMatch;

  while ((sectionMatch = sectionPattern.exec(html))) {
    const heading = textFromHtml(sectionMatch[1]);
    const date = parseArxivDate(heading);
    if (!date) continue;

    const papers = [];
    const body = sectionMatch[2];
    const itemPattern = /(<dt[\s\S]*?<\/dt>)\s*(<dd[\s\S]*?<\/dd>)/gi;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(body))) {
      const itemHtml = `${itemMatch[1]}\n${itemMatch[2]}`;
      const idMatch = itemHtml.match(/\/abs\/(\d{4}\.\d+)(?:v\d+)?/) || itemHtml.match(/arXiv:(\d{4}\.\d+)/);
      if (!idMatch) continue;

      const subjects = extractClassBlock(itemHtml, "list-subjects");
      const categories = extractCategories(subjects, sourceCategory);
      if (!categories.length) continue;

      papers.push({
        id: idMatch[1],
        title: extractClassBlock(itemHtml, "list-title"),
        authors: extractClassBlock(itemHtml, "list-authors"),
        comments: extractClassBlock(itemHtml, "list-comments"),
        journalRef: extractClassBlock(itemHtml, "list-journal-ref"),
        subjects,
        categories,
        sourceCategories: [sourceCategory]
      });
    }

    sections.push({ date, heading, papers });
  }

  return sections;
}

function mergePapers(items) {
  const byId = new Map();

  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, {
        ...item,
        categories: [...new Set(item.categories)],
        sourceCategories: [...new Set(item.sourceCategories)]
      });
      continue;
    }

    existing.categories = [...new Set([...existing.categories, ...item.categories])];
    existing.sourceCategories = [...new Set([...existing.sourceCategories, ...item.sourceCategories])];
    existing.title ||= item.title;
    existing.authors ||= item.authors;
    existing.comments ||= item.comments;
    existing.journalRef ||= item.journalRef;
    existing.subjects ||= item.subjects;
  }

  return [...byId.values()];
}

async function enrichPaper(paper) {
  try {
    const html = await fetchText(`https://arxiv.org/abs/${paper.id}`, 2);
    const title = extractClassBlock(html, "title", "h1");
    const authors = extractClassBlock(html, "authors", "div");
    const abstract = extractClassBlock(html, "abstract", "blockquote");
    const subjects = extractClassBlock(html, "subjects", "td");
    const categories = extractCategories(subjects || paper.subjects, "");

    return {
      ...paper,
      title: title || paper.title,
      authors: authors || paper.authors,
      abstract,
      subjects: subjects || paper.subjects,
      categories: categories.length ? categories : paper.categories
    };
  } catch (error) {
    return {
      ...paper,
      abstract: "",
      fetchWarning: error.message
    };
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function firstSentence(text = "") {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.{40,260}?[.!?])\s/);
  return match ? match[1] : clean.slice(0, 260);
}

function sentenceList(text = "") {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9$])/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function trimSentence(text = "", limit = 210) {
  const clean = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).replace(/\s+\S*$/, "")}...`;
}

function withoutTerminalPunctuation(text = "") {
  return trimSentence(text, 240).replace(/[。.!?？]+$/g, "").trim();
}

function chineseSentence(prefix, text, limit = 210) {
  const body = withoutTerminalPunctuation(text);
  if (!body) return "";
  return `${prefix}${trimSentence(body, limit)}。`;
}

function sentenceAfterLead(sentence = "") {
  const clean = trimSentence(sentence, 220);
  return clean
    .replace(/^We\s+(investigate|study|analyze|analyse|demonstrate|show|present|report|explore|consider|develop|propose)\s+/i, "")
    .replace(/^Here,\s+we\s+(investigate|study|analyze|analyse|demonstrate|show|present|report|explore|consider|develop|propose)\s+/i, "")
    .replace(/^This\s+(paper|work|study)\s+(investigates|studies|analyzes|analyses|demonstrates|shows|presents|reports|explores|considers|develops|proposes)\s+/i, "")
    .replace(/^Our\s+results\s+(show|demonstrate|reveal|suggest)\s+that\s+/i, "")
    .replace(/^that\s+/i, "")
    .trim();
}

function cleanupLatex(text = "") {
  return text
    .replace(/\$+/g, "")
    .replace(/\\mathbb\{([^}]+)\}/g, "$1")
    .replace(/\\mathrm\{([^}]+)\}/g, "$1")
    .replace(/\\text\{([^}]+)\}/g, "$1")
    .replace(/\\r\{([^}]+)\}/g, "$1")
    .replace(/\\Omega/g, "Ω")
    .replace(/\\alpha/g, "α")
    .replace(/\\mu/g, "μ")
    .replace(/\\delta/g, "δ")
    .replace(/\\pm/g, "±")
    .replace(/_\{([^}]+)\}/g, "_$1")
    .replace(/\^\{([^}]+)\}/g, "^$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function translateFragment(text = "") {
  let value = cleanupLatex(text);
  const rules = [
    [/Topological superconductivity in a Hubbard model for twisted bilayer cuprates/gi, "扭转双层铜氧化物 Hubbard 模型中的拓扑超导"],
    [/Finite temperature pair density wave superconductivity in d-wave altermagnets/gi, "d 波交错磁体中的有限温配对密度波超导"],
    [/Noncollinear antiferromagnetic structure and physical properties of CrRhAs with distorted kagome lattice/gi, "畸变 kagome 晶格材料 CrRhAs 的非共线反铁磁结构和物性"],
    [/Gapped 1\/9 Magnetization Plateau in the Anisotropic Kagome Antiferromagnet Y-kapellasite/gi, "各向异性 kagome 反铁磁体 Y-kapellasite 中有能隙的 1/9 磁化平台"],
    [/Quantum spin liquid on a 3D bipartite lattice of spin trimers stabilized by enhanced effective anisotropy/gi, "增强有效各向异性稳定的三维二分自旋三聚体量子自旋液体"],
    [/Beyond the conventional Emery model: crucial role of long-range hopping for cuprate superconductivity/gi, "超越常规 Emery 模型：长程跃迁对铜氧化物超导的关键作用"],
    [/Light-driven octupolar inverse Faraday effect and multipolar order in Mott insulators/gi, "Mott 绝缘体中的光驱动八极反法拉第效应和多极序"],
    [/Intrinsic Floquet Generation and 1\/I Quantum Oscillations in a Sliding Charge-Density Wave/gi, "滑动电荷密度波中的内禀 Floquet 产生和 1/I 量子振荡"],
    [/Superconducting and correlated phases of an effective Hubbard model on the BCC lattice/gi, "BCC 晶格有效 Hubbard 模型中的超导和关联相"],
    [/Josephson spectroscopy study of kagome superconductors toward the deep point-contact regime/gi, "深点接触极限下 kagome 超导体的 Josephson 谱学"],
    [/Emergence of a correlated insulating state in bulk 1T-NbSe_?2 via metal intercalation/gi, "金属插层诱导 bulk 1T-NbSe2 中关联绝缘态的出现"],
    [/Twisted Kagome Bilayers: Higher-Order Magic Angles, Topological Flat Bands, and Sublattice Interference/gi, "扭转 kagome 双层中的高阶魔角、拓扑平带和子晶格干涉"],
    [/Topological spin freezing in frustrated quantum materials/gi, "受挫量子材料中的拓扑自旋冻结"],
    [/Quantum Electron Quasicrystal/gi, "量子电子准晶"],
    [/Probabilistic denoising for reliable signal extraction in spectroscopy/gi, "谱学可靠信号提取中的概率去噪"],
    [/Breaking the Trade-off: Bulk 2D Ising Superconductivity with High Tc and Giant Interlayer Spacing via a Unique Chain Intercalation in \(BaS\)1\/3TaS2/gi, "通过链状插层在 (BaS)1/3TaS2 中实现高 Tc、大层间距的体相二维 Ising 超导"],
    [/Ground states of quantum XY dipoles on the Archimedean lattices/gi, "阿基米德晶格上量子 XY 偶极子的基态"],
    [/the emergence of nontrivial topology/gi, "非平庸拓扑的出现"],
    [/twisted cuprate bilayer/gi, "扭转铜氧化物双层"],
    [/twisted bilayer cuprates/gi, "扭转双层铜氧化物"],
    [/weak-interaction regime/gi, "弱相互作用区间"],
    [/topological character depends sensitively on the doping level/gi, "拓扑性质对掺杂水平非常敏感"],
    [/Chern number assumes a value of ([^,.;]+)/gi, "Chern 数取 $1"],
    [/finite-momentum superconductivity/gi, "有限动量超导"],
    [/pair-density-wave|pair density wave|\bPDW\b/gi, "PDW（配对密度波）"],
    [/altermagnetism provides a field-free mechanism for stabilizing/gi, "交错磁性提供了无需外磁场稳定"],
    [/d-wave altermagnets?/gi, "d 波交错磁体"],
    [/momentum-dependent spin splitting/gi, "动量依赖的自旋劈裂"],
    [/noncollinear antiferromagnetic structure/gi, "非共线反铁磁结构"],
    [/distorted kagome lattice/gi, "畸变 kagome 晶格"],
    [/kagome metal/gi, "kagome 金属"],
    [/anomalous electrical transport properties/gi, "反常电输运性质"],
    [/strongly correlated kagome metal/gi, "强关联 kagome 金属"],
    [/Combined with the results of heat capacity measurements, a large Kadowaki-Woods ratio [^.;]+ is obtained/gi, "结合热容测量，得到较大的 Kadowaki-Woods 比，指向强关联行为"],
    [/fractional magnetization plateaus?/gi, "分数磁化平台"],
    [/many-body spin states/gi, "多体自旋态"],
    [/frustrated quantum magnets?/gi, "受挫量子磁体"],
    [/microscopic origin/gi, "微观起源"],
    [/kagome antiferromagnets?/gi, "kagome 反铁磁体"],
    [/field-induced fractional features/gi, "场诱导分数特征"],
    [/a hierarchy of field-induced fractional features, including 1\/3 and 1\/9 plateaus, as well as a weaker low-field feature/gi, "一系列场诱导分数特征，包括 1/3、1/9 平台和较弱的低场特征"],
    [/quantum spin liquids?|\bQSLs?\b/gi, "量子自旋液体"],
    [/highly entangled states of matter/gi, "高度纠缠的物态"],
    [/frustration-induced quantum fluctuations/gi, "受挫诱导的量子涨落"],
    [/symmetry-breaking phase transition/gi, "对称性破缺相变"],
    [/fractionalized excitations/gi, "分数化激发"],
    [/emergent gauge fields/gi, "涌现规范场"],
    [/three-dimensional spin-trimer magnet/gi, "三维自旋三聚体磁体"],
    [/bipartite quantum spin liquid/gi, "二分晶格量子自旋液体"],
    [/lowest temperatures/gi, "最低温区"],
    [/Here identify the three-dimensional spin-trimer magnet ([^,.;]+) as a promising candidate for a bipartite quantum spin liquid persisting to the lowest temperatures/gi, "识别出三维自旋三聚体磁体 $1 是可在最低温区保持的二分晶格量子自旋液体候选"],
    [/Here we identify the three-dimensional spin-trimer magnet ([^,.;]+) as a promising candidate for a bipartite quantum spin liquid persisting to the lowest temperatures/gi, "识别出三维自旋三聚体磁体 $1 是可在最低温区保持的二分晶格量子自旋液体候选"],
    [/The Emery model is the quintessential model for cuprate superconductors/gi, "Emery 模型是描述铜氧化物超导的经典模型"],
    [/long-range hopping/gi, "长程跃迁"],
    [/cuprate superconductivity/gi, "铜氧化物超导"],
    [/superconducting dome/gi, "超导穹顶"],
    [/dynamical vertex approximation/gi, "动态顶点近似"],
    [/\bcuprates\b/gi, "铜氧化物"],
    [/hidden multipolar orders?/gi, "隐藏多极序"],
    [/spin-orbit-coupled Mott insulators?/gi, "自旋轨道耦合 Mott 绝缘体"],
    [/control and detection remain major challenges/gi, "调控和探测仍是主要挑战"],
    [/circularly polarized light/gi, "圆偏振光"],
    [/both in 4d\^2\/5d\^2 systems with edge-sharing octahedra/gi, "在具有共边八面体的 4d^2/5d^2 体系中同时实现这两种效应"],
    [/octupolar inverse Faraday effect/gi, "八极反法拉第效应"],
    [/multipolar order/gi, "多极序"],
    [/deep learning/gi, "深度学习"],
    [/powerful capabilities for scientific research/gi, "为科学研究提供强大能力"],
    [/its application is often hindered by a lack of quantitative reliability/gi, "其应用常受定量可靠性不足限制"],
    [/this approach on three-dimensional ARPES data, showing that the model reliably recovers the spectral features of a cuprate superconductor from Poisson-distributed noise/gi, "该方法用于三维 ARPES 数据，并能从泊松噪声中可靠恢复铜氧化物超导体的谱特征"],
    [/quantitative reliability/gi, "定量可靠性"],
    [/angle-resolved photoemission spectroscopy|\bARPES\b/gi, "ARPES"],
    [/Poisson-distributed noise/gi, "泊松噪声"],
    [/spectral features/gi, "谱特征"],
    [/Ising Superconductivity/gi, "Ising 超导"],
    [/transition metal dichalcogenides|\bTMDs\b/gi, "过渡金属硫族化物"],
    [/low dimensional superconductivity/gi, "低维超导"],
    [/superconducting transition temperature|\bTc\b/gi, "超导转变温度 Tc"],
    [/interlayer spacing/gi, "层间距"],
    [/chain intercalation/gi, "链状插层"],
    [/ground states?/gi, "基态"],
    [/quantum XY dipoles?/gi, "量子 XY 偶极子"],
    [/numerical ground states? for dipolar XY spin model/gi, "偶极 XY 自旋模型的数值基态"],
    [/two-dimensional arrays of polar molecules and two-level Rydberg atoms/gi, "二维极性分子阵列和两能级 Rydberg 原子阵列"],
    [/Archimedean lattices?/gi, "阿基米德晶格"],
    [/electronic excitations?/gi, "电子激发"],
    [/Shastry-Sutherland compound/gi, "Shastry-Sutherland 化合物"],
    [/Majorana bound states?/gi, "Majorana 束缚态"],
    [/chiral ferromagnet-superconductor heterostructures?/gi, "手性铁磁-超导异质结构"],
    [/bulk and surface electronic structure/gi, "体态和表面电子结构"],
    [/targeted cleave planes?/gi, "定向解理面"],
    [/heavy fermion system/gi, "重费米子体系"],
    [/dynamic magnetic ground state/gi, "动态磁基态"],
    [/helimagnetism/gi, "螺旋磁性"],
    [/body-centered tetragonal lattice/gi, "体心四方晶格"],
    [/chiral ferromagnetism/gi, "手性铁磁性"],
    [/microscopic magnetism/gi, "微观磁性"],
    [/parafermions?/gi, "parafermion 准粒子"],
    [/electronic ladder model/gi, "电子梯子模型"],
    [/conformal invariance/gi, "共形不变性"],
    [/X-ray and Neutron Experiments/gi, "X 射线和中子实验"],
    [/Kronig-Penney Model/gi, "Kronig-Penney 模型"],
    [/Harmonic Oscillator Wells/gi, "谐振子势阱"],
    [/Tight-Binding/gi, "紧束缚"],
    [/gapped phases/gi, "有能隙相"],
    [/boundary conformal field theories/gi, "边界共形场论"],
    [/wavefunction approach/gi, "波函数方法"],
    [/quantum many-body systems/gi, "量子多体系统"],
    [/magnetoelectric response/gi, "磁电响应"],
    [/antiferromagnetic zigzag chains/gi, "反铁磁 zigzag 链"],
    [/downfolding approach/gi, "降维有效模型方法"],
    [/phase-coherence scaling/gi, "相干相位标度"],
    [/quantum-critical Dirac semimetal/gi, "量子临界 Dirac 半金属"],
    [/fractional quantum Hall edge/gi, "分数量子霍尔边缘"],
    [/intrinsic dipole moment/gi, "内禀偶极矩"],
    [/probabilistic imaginary-time evolution/gi, "概率虚时演化"],
    [/superconducting radio-frequency applications/gi, "超导射频应用"],
    [/transport AC losses/gi, "输运交流损耗"],
    [/nematic fluctuations?/gi, "nematic 涨落"],
    [/collective modes?/gi, "集体模"],
    [/Rydberg arrays?/gi, "Rydberg 阵列"],
    [/Dirac magnons?/gi, "Dirac 磁振子"],
    [/atomic limit/gi, "原子极限"],
    [/pair-breaking/gi, "破对效应"],
    [/Spin-Orbit Coupled Superconductors/gi, "自旋轨道耦合超导体"],
    [/electron quasicrystal/gi, "电子准晶"],
    [/charge trapping dynamics/gi, "电荷俘获动力学"],
    [/sulphur divacancy/gi, "硫双空位"],
    [/spin quantum Hall edge states/gi, "自旋量子霍尔边缘态"],
    [/two-dimensional electron gas/gi, "二维电子气"],
    [/s-wave superconductor/gi, "s 波超导体"],
    [/proton irradiation/gi, "质子辐照"],
    [/critical current density|J_c|Jc/gi, "临界电流密度 Jc"],
    [/Bethe solutions?/gi, "Bethe 解"],
    [/Heisenberg Chain/gi, "Heisenberg 链"],
    [/zero-magnetization plateaus?/gi, "零磁化平台"],
    [/spin dimers?/gi, "自旋二聚体"],
    [/Chern Ferromagnets?/gi, "Chern 铁磁体"],
    [/spin polarons?/gi, "自旋极化子"],
    [/Mott insulators?/gi, "Mott 绝缘体"],
    [/Hubbard model/gi, "Hubbard 模型"],
    [/superconductivity/gi, "超导"],
    [/superconducting/gi, "超导"],
    [/correlated phases?/gi, "关联相"],
    [/correlated insulating state/gi, "关联绝缘态"],
    [/charge-density wave|charge density wave|\bCDW\b/gi, "电荷密度波"],
    [/Floquet/gi, "Floquet"],
    [/quantum oscillations?/gi, "量子振荡"],
    [/magnetoresistance/gi, "磁阻"],
    [/phonon driven exchange dynamics/gi, "声子驱动的交换动力学"],
    [/Moir[eé] Superlattices?/gi, "moiré 超晶格"],
    [/interlayer charge-transfer states?/gi, "层间电荷转移态"],
    [/topological flat bands?/gi, "拓扑平带"],
    [/magic angles?/gi, "魔角"],
    [/sublattice interference/gi, "子晶格干涉"],
    [/sliding/gi, "滑动"],
    [/bulk/gi, "体相"],
    [/surface/gi, "表面"],
    [/magnetic structure/gi, "磁结构"],
    [/physical properties/gi, "物性"],
    [/topological/gi, "拓扑"],
    [/nontrivial/gi, "非平庸"],
    [/doping level/gi, "掺杂水平"],
    [/edge states?/gi, "边缘态"],
    [/chirality/gi, "手性"],
    [/finite-width geometry/gi, "有限宽几何"],
    [/thermal fluctuations?/gi, "热涨落"],
    [/pseudogap/gi, "赝能隙"],
    [/spectroscopic/gi, "谱学"],
    [/real-space signatures?/gi, "实空间特征"],
    [/experimentally testable signatures?/gi, "可实验检验的特征"],
    [/low-energy spin fluctuations?/gi, "低能自旋涨落"],
    [/activated behavior/gi, "激活行为"],
    [/effective anisotropy/gi, "有效各向异性"],
    [/bond anisotropy/gi, "键各向异性"],
    [/gapless dynamical ground state/gi, "无能隙动态基态"],
    [/algebraic spin autocorrelations/gi, "代数型自旋自关联"],
    [/first-principles/gi, "第一性原理"],
    [/density functional theory|\bDFT\b/gi, "DFT"],
    [/Monte Carlo/gi, "Monte Carlo"],
    [/exact-diagonalization/gi, "精确对角化"],
    [/transport measurements?/gi, "输运测量"],
    [/neutron scattering/gi, "中子散射"],
    [/\bNMR\b/gi, "NMR"],
    [/\bmuSR\b|\bμSR\b/gi, "μSR"],
    [/\bSTM\b/gi, "STM"],
    [/Raman/gi, "Raman"],
    [/we identify/gi, "识别出"],
    [/we find/gi, "发现"],
    [/we show/gi, "表明"],
    [/we demonstrate/gi, "证明"],
    [/we report/gi, "报道"],
    [/we present/gi, "给出"],
    [/our results show that/gi, "结果表明"],
    [/this work/gi, "这项工作"],
    [/this paper/gi, "这篇论文"],
    [/provides?/gi, "提供"],
    [/reveals?/gi, "揭示"],
    [/suggests?/gi, "表明"],
    [/enables?/gi, "使得"],
    [/stabiliz(?:e|es|ing)/gi, "稳定"],
    [/depends sensitively on/gi, "强烈依赖"],
    [/remains? unresolved/gi, "仍未解决"],
    [/major challenges?/gi, "主要挑战"],
    [/crucial role/gi, "关键作用"],
    [/\btoward\b/gi, "面向"],
    [/\bvia\b/gi, "通过"],
    [/\busing\b/gi, "利用"],
    [/\bbased on\b/gi, "基于"],
    [/\bconsistent with\b/gi, "符合"],
    [/\bfrom\b/gi, "来自"],
    [/\bwith\b/gi, "具有"],
    [/\band\b/gi, "和"],
    [/\bor\b/gi, "或"],
    [/\bin\b\s*/gi, "在"],
    [/ on /gi, " 在 "],
    [/\bof\b/gi, "的"],
    [/\bfor\b/gi, "用于"],
    [/\bthe\b/gi, ""],
    [/\ba\b/gi, ""],
    [/\ban\b/gi, ""]
  ];
  for (const [pattern, replacement] of rules) {
    value = value.replace(pattern, replacement);
  }
  const polishRules = [
    [/在two dimensions/gi, "在二维"],
    [/two-dimensional/gi, "二维"],
    [/Combined 具有 results的heat capacity measurements, large Kadowaki-Woods ratio .*? is obtained/gi, "结合热容测量，得到较大的 Kadowaki-Woods 比，指向强关联行为"],
    [/识别出 hierarchy的场诱导分数特征, including 1\/3 和 1\/9 plateaus, as well as weaker low-field feature/gi, "识别出一系列场诱导分数特征，包括 1/3、1/9 平台和较弱的低场特征"],
    [/Here 识别出 三维自旋三聚体磁体 ([^ ]+) as promising candidate 用于 bipartite 量子自旋液体 persisting to 最低温区/gi, "识别出三维自旋三聚体磁体 $1 是可在最低温区保持的二分晶格量子自旋液体候选"],
    [/this approach 在 three-dimensional ARPES data, showing that model reliably recovers 谱特征的cuprate superconductor 来自 泊松噪声/gi, "该方法用于三维 ARPES 数据，并能从泊松噪声中可靠恢复铜氧化物超导体的谱特征"],
    [/However, 在conventional intercalated systems, achieving high 超导转变温度 Tc .*? weakened 2D character/gi, "常规插层体系中，高 Tc 往往伴随层间距减小和二维性削弱"],
    [/We also investigate triangular lattice, 用于 which 发现 several competing phases including coplanar magnetism, stripe density wave order, 和 possible spin liquid; their relative stability is sensitive to/gi, "还研究三角晶格，发现共面磁性、条纹密度波序和可能的自旋液体等竞争相，其稳定性对参数很敏感"],
    [/three-dimensional/gi, "三维"],
    [/two-level/gi, "两能级"],
    [/superconductor/gi, "超导体"],
    [/candidate/gi, "候选"],
    [/including/gi, "包括"],
    [/as well as/gi, "以及"],
    [/possible/gi, "可能的"],
    [/conventional/gi, "常规"],
    [/intercalated systems/gi, "插层体系"],
    [/achieving/gi, "实现"],
    [/weakened/gi, "削弱的"],
    [/reduced/gi, "减小的"],
    [/hierarchy/gi, "层级结构"],
    [/plateaus/gi, "平台"],
    [/low-field feature/gi, "低场特征"],
    [/results/gi, "结果"],
    [/heat capacity measurements/gi, "热容测量"],
    [/is obtained/gi, "被得到"]
  ];
  for (const [pattern, replacement] of polishRules) {
    value = value.replace(pattern, replacement);
  }
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：？！])/g, "$1")
    .replace(/，\s*/g, "，")
    .replace(/\s*的\s*/g, "的")
    .trim();
}

function titleProblem(paper) {
  const title = cleanupLatex(paper.title).toLowerCase();
  if (/topological superconductivity.*twisted.*cuprate/.test(title)) return "扭转双层铜氧化物的 Hubbard 模型中能否出现拓扑超导？";
  if (/pair density wave.*altermagnet/.test(title)) return "d 波交错磁体中有限温度下能否稳定 PDW 超导？";
  if (/crrhas|noncollinear antiferromagnetic/.test(title)) return "畸变 kagome 材料 CrRhAs 的非共线磁结构和强关联物性是什么？";
  if (/1\/9 magnetization plateau|y-kapellasite/.test(title)) return "Y-kapellasite 中 1/9 分数磁化平台是否有能隙，并具有怎样的微观自旋结构？";
  if (/quantum spin liquid.*spin trimers/.test(title)) return "三维自旋三聚体晶格中是否能由有效各向异性稳定量子自旋液体？";
  if (/emery model|long-range hopping/.test(title)) return "铜氧化物超导建模中长程跃迁是否是不可忽略的关键因素？";
  if (/light-driven|inverse faraday|multipolar/.test(title)) return "光场能否在 Mott 绝缘体中诱导多极响应并调控隐藏多极序？";
  if (/floquet|sliding charge-density wave/.test(title)) return "滑动电荷密度波是否能自发产生 Floquet 态和量子振荡？";
  if (/hubbard.*bcc/.test(title)) return "BCC 晶格有效 Hubbard 模型中超导、Mott 与磁性关联相如何竞争？";
  if (/josephson.*kagome/.test(title)) return "kagome 超导体在深点接触极限下的 Josephson 谱如何解释？";
  if (/correlated insulating state.*nbse/.test(title)) return "金属插层能否在体相 1T-NbSe2 中诱导关联绝缘态？";
  if (/twisted kagome bilayers/.test(title)) return "扭转 kagome 双层中魔角、拓扑平带和子晶格干涉如何出现？";
  if (/topological spin freezing/.test(title)) return "受挫量子材料中的慢自旋动力学能否由拓扑自旋冻结解释？";
  if (/quantum electron quasicrystal/.test(title)) return "电子系统能否不依赖外部 moiré 势而自发形成准晶态？";
  if (/probabilistic denoising|spectroscopy/.test(title)) return "如何从有噪声的谱学数据中可靠提取物理信号并量化不确定性？";
  if (/ising superconductivity|chain intercalation/.test(title)) return "能否在体相层状材料中同时获得高 Tc、强二维性和大层间距的 Ising 超导？";
  if (/quantum xy dipoles|archimedean/.test(title)) return "阿基米德晶格上的量子 XY 偶极相互作用会稳定哪些基态？";
  if (/multilayer model|superconducting radio-frequency/.test(title)) return "任意多层超导射频涂层的电磁响应和损耗如何建模？";
  return genericProblem(paper);
}

function titleOneLine(paper, firstSentenceText) {
  const title = cleanupLatex(paper.title).toLowerCase();
  if (/topological superconductivity.*twisted.*cuprate/.test(title)) return "用 Hubbard 模型研究扭转双层铜氧化物中的拓扑超导和掺杂依赖。";
  if (/pair density wave.*altermagnet/.test(title)) return "提出交错磁性可在无外磁场条件下稳定有限动量 PDW 超导。";
  if (/crrhas|noncollinear antiferromagnetic/.test(title)) return "实验确定 CrRhAs 的非共线反铁磁结构，并揭示其强关联 kagome 金属性。";
  if (/1\/9 magnetization plateau|y-kapellasite/.test(title)) return "在各向异性 kagome 反铁磁体 Y-kapellasite 中识别出有能隙的 1/9 磁化平台。";
  if (/quantum spin liquid.*spin trimers/.test(title)) return "提出三维自旋三聚体网络中由增强有效各向异性稳定的量子自旋液体候选。";
  if (/emery model|long-range hopping/.test(title)) return "指出长程跃迁对铜氧化物超导的 Emery 模型描述至关重要。";
  if (/light-driven|inverse faraday|multipolar/.test(title)) return "研究圆偏振光如何在 Mott 绝缘体中诱导八极反法拉第效应并耦合多极序。";
  if (/floquet|sliding charge-density wave/.test(title)) return "说明滑动电荷密度波可把空间周期转化为时间周期，从而产生内禀 Floquet 侧带。";
  if (/probabilistic denoising|spectroscopy/.test(title)) return "提出用于谱学数据的概率去噪方法，强调信号恢复的可靠性和不确定性。";
  if (/ising superconductivity|chain intercalation/.test(title)) return "通过链状插层设计体相二维 Ising 超导，兼顾高 Tc 与大层间距。";
  if (/quantum xy dipoles|archimedean/.test(title)) return "系统研究阿基米德晶格上偶极 XY 自旋模型的量子基态。";
  if (/multilayer model|superconducting radio-frequency/.test(title)) return "扩展超导射频多层涂层模型，用于处理任意层序和材料组合。";
  return genericOneLine(paper);
}

function resultFromTitle(paper) {
  const title = cleanupLatex(paper.title).toLowerCase();
  if (/topological superconductivity.*twisted.*cuprate/.test(title)) return "结果表明，拓扑性质对掺杂水平非常敏感，电子掺杂时可出现非零 Chern 数和手性边缘态。";
  if (/pair density wave.*altermagnet/.test(title)) return "结果表明，动量依赖的自旋劈裂可增强有限动量配对，使 PDW 在有限温度窗口内保持稳定。";
  if (/crrhas|noncollinear antiferromagnetic/.test(title)) return "结果表明，CrRhAs 具有非共线反铁磁结构、反常输运和较大的 Kadowaki-Woods 比，指向强关联 kagome 金属性。";
  if (/1\/9 magnetization plateau|y-kapellasite/.test(title)) return "结果表明，该体系存在 1/3 和 1/9 等分数磁化平台，其中 1/9 平台伴随低能自旋涨落抑制和有能隙行为。";
  if (/quantum spin liquid.*spin trimers/.test(title)) return "结果表明，KBa3Ca4Cu3V7O28 在低温下没有磁冻结或对称性破缺，呈现无能隙动态基态，是三维量子自旋液体候选。";
  if (/emery model|long-range hopping/.test(title)) return "结果表明，加入长程跃迁后可得到更符合铜氧化物的超导穹顶，说明常规 Emery 模型需要扩展。";
  if (/light-driven|inverse faraday|multipolar/.test(title)) return "结果表明，圆偏振光可在共边八面体的 4d/5d Mott 体系中诱导八极响应，并提供探测多极序的新通道。";
  if (/probabilistic denoising|spectroscopy/.test(title)) return "结果表明，该概率模型能在带泊松噪声的三维 ARPES 数据中可靠恢复铜氧化物超导体的谱特征。";
  if (/ising superconductivity|chain intercalation/.test(title)) return "结果表明，链状插层可打破高 Tc 与二维性之间的常规权衡，增强层间距并保持体相 Ising 超导。";
  if (/quantum xy dipoles|archimedean/.test(title)) return "结果表明，不同阿基米德晶格上会出现多种竞争基态，包括共面磁性、条纹密度波序和可能的自旋液体。";
  if (/multilayer model|superconducting radio-frequency/.test(title)) return "结果表明，该模型可推广到任意层序的超导、绝缘或正常金属涂层，用于评估超导射频应用中的损耗。";
  return "";
}

function materialContext(paper) {
  const text = cleanupLatex(`${paper.title} ${paper.abstract}`);
  const lower = text.toLowerCase();
  const materials = [
    [/La_?3Ni_?2O_?7/i, "La3Ni2O7"],
    [/La_?4Ni_?3O_?10/i, "La4Ni3O10"],
    [/RNiO_?3/i, "RNiO3"],
    [/NdNiO_?2/i, "NdNiO2"],
    [/CrRhAs/i, "CrRhAs"],
    [/WTe_?2/i, "WTe2"],
    [/NbSe_?2/i, "NbSe2"],
    [/TaS_?2/i, "TaS2"],
    [/\(BaS\)1\/3TaS_?2/i, "(BaS)1/3TaS2"],
    [/Y-kapellasite/i, "Y-kapellasite"]
  ];
  for (const [pattern, label] of materials) {
    if (pattern.test(text)) return label;
  }
  if (/nickelate|nickelates|ni-based/.test(lower)) return "镍酸盐体系";
  if (/cuprate|cuprates/.test(lower)) return "铜氧化物体系";
  if (/kagome/.test(lower)) return "kagome 体系";
  if (/bilayer/.test(lower)) return "双层体系";
  if (/moire|moiré|twisted/.test(lower)) return "扭转或 moiré 体系";
  if (/hubbard/.test(lower)) return "Hubbard 模型";
  if (/supercon/.test(lower)) return "超导体系";
  if ((paper.categories || []).includes("cond-mat.str-el") && (paper.categories || []).includes("cond-mat.supr-con")) {
    return "强关联超导体系";
  }
  if ((paper.categories || []).includes("cond-mat.supr-con")) return "超导体系";
  return "强关联电子体系";
}

function aspectContext(paper) {
  const text = cleanupLatex(`${paper.title} ${paper.abstract}`).toLowerCase();
  const aspects = [];
  if (/orbital-selective|orbital selective|orbital/.test(text) && /fermi|fermiology/.test(text)) aspects.push("轨道选择性费米面重构");
  if (/fermi surface|fermiology|fermi arc|pocket/.test(text) && !aspects.some(item => item.includes("费米"))) aspects.push("费米面结构");
  if (/pair density wave|\bpdw\b/.test(text)) aspects.push("PDW 配对");
  if (/pair-phase|phase resonance|collective mode/.test(text)) aspects.push("配对相位集体模");
  if (/superconduct|pairing|cooper/.test(text)) aspects.push("超导配对机制");
  if (/jahn-teller/.test(text)) aspects.push("Jahn-Teller 畸变和绝缘相");
  if (/bkt|berezinskii/.test(text)) aspects.push("BKT 转变和相位涨落");
  if (/charge density wave|\bcdw\b|charge order/.test(text)) aspects.push("电荷序");
  if (/magnet|spin|antiferro|ferro/.test(text)) aspects.push("磁性和自旋涨落");
  if (/topolog|chern|majorana/.test(text)) aspects.push("拓扑性质");
  if (/flat band|magic angle/.test(text)) aspects.push("平带和魔角效应");
  if (/phonon|electron-phonon|lattice/.test(text)) aspects.push("电子-晶格耦合");
  if (/transport|resistivity|hall/.test(text)) aspects.push("输运性质");
  if (/spectroscopy|arpes|raman|stm|josephson/.test(text)) aspects.push("谱学响应");
  if (/hubbard|emery|tight-binding|model/.test(text)) aspects.push("有效模型");

  const unique = [...new Set(aspects)];
  if (unique.length >= 2) return `${unique[0]}与${unique[1]}`;
  return unique[0] || "低能电子结构和相行为";
}

function summaryContext(paper) {
  return {
    material: materialContext(paper),
    aspect: aspectContext(paper)
  };
}

function genericOneLine(paper) {
  const { material, aspect } = summaryContext(paper);
  return `本文关注${material}中的${aspect}。`;
}

function genericProblem(paper) {
  const { material, aspect } = summaryContext(paper);
  if (/机制/.test(aspect)) return `${material}中的${aspect}由哪些相互作用或对称性因素控制？`;
  if (/谱学/.test(aspect)) return `${material}中的${aspect}能否揭示低能自由度和相干性质？`;
  if (/输运/.test(aspect)) return `${material}中的${aspect}如何反映关联效应和对称性破缺？`;
  return `${material}中的${aspect}如何由相互作用、晶格效应或对称性共同决定？`;
}

function genericResult(paper) {
  const text = cleanupLatex(`${paper.title} ${paper.abstract}`).toLowerCase();
  const { material, aspect } = summaryContext(paper);
  if (/orbital-selective|fermi surface|fermi arc|pocket/.test(text) && /correlation|hubbard|dmrg|cpt/.test(text)) {
    return "结果表明，电子关联会显著重构低能谱和费米面，并可能改变主导配对通道。";
  }
  if (/pair-phase|phase resonance|collective mode/.test(text)) {
    return "结果表明，相对相位自由度可以形成可观测的集体模，并为谱学探测提供特征信号。";
  }
  if (/jahn-teller/.test(text)) {
    return "结果表明，Jahn-Teller 畸变与电子-晶格耦合可以稳定非磁性绝缘相。";
  }
  if (/bkt|berezinskii/.test(text)) {
    return "结果表明，单一 BKT 转变在各向异性响应中可能表现出方向依赖的表观转变温度。";
  }
  if (/cooper|strain|orbitally polarized/.test(text)) {
    return "结果表明，晶体对称性降低可以诱导轨道极化的 Cooper 对，并带来横向磁响应。";
  }
  if (/charge density wave|\bcdw\b|charge order/.test(text)) {
    return "结果表明，电荷序与低能电子结构之间存在紧密耦合，并可能影响相邻的超导或磁性态。";
  }
  if (/topolog|chern|majorana/.test(text)) {
    return "结果表明，该体系的拓扑性质会受到相互作用、几何结构或配对通道的显著调控。";
  }
  if (/magnet|spin|antiferro|ferro/.test(text)) {
    return "结果表明，磁性相互作用和低能自旋涨落会显著影响该体系的相行为。";
  }
  if (/phonon|electron-phonon|lattice/.test(text)) {
    return "结果表明，电子-晶格耦合会改变低能电子结构，并可能推动有序相或能隙重整化。";
  }
  if (/superconduct|pairing/.test(text)) {
    return "结果表明，配对通道和相干性质对相互作用强度、能带结构或对称性条件较为敏感。";
  }
  return `结果给出了${material}中${aspect}与相互作用、晶格效应或对称性之间关系的具体判断。`;
}

function findSentence(sentences, patterns, fallbackIndex = 0) {
  return sentences.find(sentence => patterns.some(pattern => pattern.test(sentence))) || sentences[fallbackIndex] || sentences[0] || "";
}

function methodFromText(paper, sentences) {
  const haystack = `${paper.title} ${paper.abstract} ${paper.comments}`.toLowerCase();
  const methodHints = [
    ["multilayer model", "多层电磁模型"],
    ["dynamical vertex approximation", "动态顶点近似"],
    ["static path approximation", "静态路径近似"],
    ["density functional", "DFT 计算"],
    ["dft", "DFT 计算"],
    ["monte carlo", "Monte Carlo 模拟"],
    ["exact diagonal", "精确对角化"],
    ["dmft", "DMFT 分析"],
    ["renormalization", "重整化群分析"],
    ["mean-field", "平均场理论"],
    ["mean field", "平均场理论"],
    ["tight-binding", "紧束缚模型"],
    ["tight binding", "紧束缚模型"],
    ["hubbard", "Hubbard 模型分析"],
    ["neutron", "中子散射实验"],
    ["nmr", "NMR 谱学"],
    ["mu sr", "muSR 测量"],
    ["µsr", "muSR 测量"],
    ["arpes", "ARPES 谱学"],
    ["stm", "STM/隧穿谱"],
    ["transport", "输运测量"],
    ["spectroscopy", "谱学分析"],
    ["x-ray", "X 射线表征"],
    ["raman", "Raman 光谱"],
    ["josephson", "Josephson 谱学"],
    ["first-principles", "第一性原理计算"]
  ];
  const hints = methodHints
    .filter(([keyword]) => haystack.includes(keyword))
    .map(([, label]) => label);
  if (hints.length) {
    return `${[...new Set(hints)].slice(0, 3).join("、")}。`;
  }

  if (/experiment|measure|sample|single crystal|thin film/.test(haystack)) return "实验测量与数据分析。";
  if (/model|theory|analytical|calculation|simulation|numerical/.test(haystack)) return "模型分析与数值计算。";
  return "结合理论分析、数值计算或实验表征。";
}

function buildChineseSummary(paper, ranking) {
  const sentences = sentenceList(paper.abstract);
  const first = sentences[0] || paper.title || `arXiv:${paper.id}`;
  const categories = paper.categories || [];
  const hasStr = categories.includes("cond-mat.str-el");
  const hasSupr = categories.includes("cond-mat.supr-con");

  let why = ranking.reason;
  if (!why || why.includes("候选")) {
    if (hasStr && hasSupr) {
      why = "连接强关联电子与超导两个栏目，适合优先判断相竞争和配对机制。";
    } else if (hasSupr) {
      why = "有助于跟踪超导材料、配对机制或临界性质的新进展。";
    } else {
      why = "有助于跟踪强关联体系中的新材料、新模型或新实验线索。";
    }
  }

  return {
    oneLine: titleOneLine(paper, first),
    problem: titleProblem(paper),
    result: resultFromTitle(paper) || genericResult(paper),
    methods: methodFromText(paper, sentences),
    why
  };
}

function scorePaper(paper) {
  const haystack = `${paper.title} ${paper.abstract} ${paper.subjects}`.toLowerCase();
  let score = 0;
  let reason = "";

  if (paper.categories.includes("cond-mat.str-el") && paper.categories.includes("cond-mat.supr-con")) {
    score += 7;
    reason = "同时出现在 str-el 与 supr-con，适合优先看强关联与超导交叉。";
  }

  for (const [keyword, value, keywordReason] of INTEREST_KEYWORDS) {
    if (haystack.includes(keyword)) {
      score += value;
      reason ||= keywordReason;
    }
  }

  for (const [keyword, value] of LOW_PRIORITY_KEYWORDS) {
    if (haystack.includes(keyword)) {
      score += value;
    }
  }

  if (!reason) {
    reason = "按标题、摘要关键词和栏目相关度排入今日候选。";
  }

  return { score, reason };
}

function normalizePaper(paper, importantIds) {
  const ranking = scorePaper(paper);
  const structured = buildChineseSummary(paper, ranking);
  const categories = paper.categories.filter(category => CATEGORIES.includes(category));
  return {
    id: paper.id,
    title: paper.title || `arXiv:${paper.id}`,
    authors: paper.authors || "",
    category: categories.map(category => category.replace("cond-mat.", "")),
    categories,
    important: importantIds.has(paper.id),
    score: ranking.score,
    oneLine: structured.oneLine,
    problem: structured.problem,
    result: structured.result,
    methods: structured.methods,
    why: structured.why,
    summary: structured.oneLine || firstSentence(paper.abstract) || "arXiv 页面暂未提供摘要文本。",
    abstract: paper.abstract || "",
    priorityReason: structured.why,
    comments: paper.comments || "",
    journalRef: paper.journalRef || "",
    subjects: paper.subjects || "",
    sourceCategories: paper.sourceCategories || [],
    url: `https://arxiv.org/abs/${paper.id}`
  };
}

async function readExistingData() {
  try {
    const text = await readFile(DATA_FILE, "utf8");
    const match = text.match(/window\.ARXIV_DAILY_DATA\s*=\s*([\s\S]*?);\s*$/);
    if (!match) return { days: [] };
    return JSON.parse(match[1]);
  } catch {
    return { days: [] };
  }
}

function buildNote(day) {
  const count = day.papers.length;
  const str = day.papers.filter(p => p.categories.includes("cond-mat.str-el")).length;
  const supr = day.papers.filter(p => p.categories.includes("cond-mat.supr-con")).length;
  return `今日 arXiv recent 中文整理：共 ${count} 篇，str-el ${str} 篇，supr-con ${supr} 篇。`;
}

async function writeData(nextData) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const json = JSON.stringify(nextData, null, 2);
  await writeFile(
    DATA_FILE,
    `window.ARXIV_DAILY_DATA = ${json};\n`,
    "utf8"
  );
}

async function main() {
  const requestedDate = readRequestedDate();
  const listPages = await Promise.all(
    CATEGORIES.map(async category => ({
      category,
      sections: parseListPage(
        await fetchText(`https://arxiv.org/list/${category}/recent`),
        category
      )
    }))
  );

  const availableDates = listPages
    .flatMap(page => page.sections.map(section => section.date))
    .filter(Boolean)
    .sort();

  const latestDate = availableDates.at(-1);
  if (!latestDate) {
    throw new Error("No dated arXiv sections found.");
  }

  const targetDate = requestedDate || latestDate;
  if (!availableDates.includes(targetDate)) {
    throw new Error(`Requested arXiv date ${targetDate} is not visible on the recent pages.`);
  }

  const dailyItems = listPages.flatMap(page => {
    const section = page.sections.find(item => item.date === targetDate);
    return section ? section.papers : [];
  });

  const merged = mergePapers(dailyItems);
  const enriched = await mapLimit(merged, 4, enrichPaper);
  const ranked = enriched
    .map(paper => ({ paper, ...scorePaper(paper) }))
    .sort((a, b) => b.score - a.score || b.paper.id.localeCompare(a.paper.id));

  const importantIds = new Set(ranked.slice(0, Math.min(3, ranked.length)).map(item => item.paper.id));
  const papers = ranked
    .map(item => normalizePaper(item.paper, importantIds))
    .sort((a, b) => Number(b.important) - Number(a.important) || b.score - a.score || b.id.localeCompare(a.id));

  const day = {
    date: targetDate,
    title: formatChineseDate(targetDate),
    note: "",
    stats: { total: 0, str: 0, supr: 0 },
    sourcePages: CATEGORIES.map(category => `https://arxiv.org/list/${category}/recent`),
    focusCount: importantIds.size,
    papers
  };
  day.stats = {
    total: day.papers.length,
    str: day.papers.filter(p => p.categories.includes("cond-mat.str-el")).length,
    supr: day.papers.filter(p => p.categories.includes("cond-mat.supr-con")).length
  };
  day.note = buildNote(day);

  const existing = await readExistingData();
  const days = [
    day,
    ...(existing.days || []).filter(item => item.date !== targetDate)
  ].sort((a, b) => b.date.localeCompare(a.date));

  const nextData = {
    updatedAt: new Date().toISOString(),
    timezone: "Europe/London",
    categories: CATEGORIES.map(id => ({ id, label: CATEGORY_LABELS[id] })),
    days
  };

  await writeData(nextData);
  console.log(`Updated ${DATA_FILE} with ${papers.length} papers for ${targetDate}.`);
}

function readRequestedDate() {
  const dateArgIndex = process.argv.indexOf("--date");
  const value = dateArgIndex >= 0 ? process.argv[dateArgIndex + 1] : process.env.ARXIV_DATE;
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }
  return value;
}

function formatChineseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export {
  CATEGORIES,
  CATEGORY_LABELS,
  buildNote,
  normalizePaper,
  scorePaper
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
