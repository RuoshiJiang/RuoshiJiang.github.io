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

function findSentence(sentences, patterns, fallbackIndex = 0) {
  return sentences.find(sentence => patterns.some(pattern => pattern.test(sentence))) || sentences[fallbackIndex] || sentences[0] || "";
}

function methodFromText(paper, sentences) {
  const haystack = `${paper.title} ${paper.abstract} ${paper.comments}`.toLowerCase();
  const methodHints = [
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

  const methodSentence = findSentence(sentences, [
    /\busing\b/i,
    /\bbased on\b/i,
    /\bby\b/i,
    /\bwe measure\b/i,
    /\bwe compute\b/i,
    /\bwe calculate\b/i,
    /\bexperiment/i,
    /\bsimulation/i
  ], 2);
  return methodSentence ? chineseSentence("方法上，", sentenceAfterLead(methodSentence) || methodSentence, 190) : "结合理论分析、数值计算或实验表征。";
}

function buildChineseSummary(paper, ranking) {
  const sentences = sentenceList(paper.abstract);
  const first = sentences[0] || paper.title || `arXiv:${paper.id}`;
  const resultSentence = findSentence(sentences, [
    /\bshow\b/i,
    /\bdemonstrate\b/i,
    /\breveal\b/i,
    /\bfind\b/i,
    /\bidentify\b/i,
    /\bestablish\b/i,
    /\bresults?\b/i,
    /\bsuggest\b/i
  ], 1);
  const topic = sentenceAfterLead(first) || paper.title;
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
    oneLine: chineseSentence("本文研究 ", sentenceAfterLead(first) || first, 190),
    problem: `这篇论文关注：${withoutTerminalPunctuation(topic)}？`,
    result: resultSentence ? chineseSentence("结果表明，", sentenceAfterLead(resultSentence) || resultSentence, 210) : "摘要中给出了新的结果或解释框架，值得结合原文进一步判断。",
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

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
