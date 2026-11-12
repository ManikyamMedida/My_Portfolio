import {
  certs,
  experience,
  profile,
  projects,
  skills,
} from "@/lib/data";
import {
  EXTRA_KNOWLEDGE,
  MEMOIZED_KNOWLEDGE,
  PRONOUNS,
} from "@/lib/knowledge";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface InstantTopic {
  id: string;
  exact: string[];
  phrases: Array<{ term: string; weight: number }>;
  keywords: Array<{ term: string; weight: number }>;
  minScore: number;
  maxWords?: number;
  build: () => string;
}

const TOPICS: InstantTopic[] = [
  {
    id: "projects",
    exact: [
      `${PRONOUNS.possessive} projects`,
      "projects",
      `summarize ${PRONOUNS.possessive} verification and rtl projects`,
      `what are ${PRONOUNS.possessive} projects`,
      `tell me about ${PRONOUNS.possessive} projects`,
    ],
    phrases: [
      { term: "her projects", weight: 4 },
      { term: "verification projects", weight: 4 },
      { term: "rtl projects", weight: 4 },
      { term: "what did she build", weight: 4 },
    ],
    keywords: [
      { term: "project", weight: 3 },
      { term: "projects", weight: 3 },
      { term: "portfolio", weight: 2 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () => {
      const list = projects
        .map((p) => `- **${p.title}** (${p.date}): ${p.summary}`)
        .join("\n");
      return `Here are Manikyam's key verification and RTL projects (see the Projects section):\n\n${list}`;
    },
  },
  {
    id: "skills",
    exact: [
      "skills tools",
      "skills and tools",
      "skills",
      `tell me about ${PRONOUNS.possessive} technical skills and verification tools`,
      `what are ${PRONOUNS.possessive} skills`,
    ],
    phrases: [
      { term: "skills and tools", weight: 4 },
      { term: "technical skills", weight: 4 },
      { term: "her skills", weight: 4 },
    ],
    keywords: [
      { term: "skill", weight: 3 },
      { term: "skills", weight: 3 },
      { term: "stack", weight: 2 },
    ],
    minScore: 3,
    maxWords: 10,
    build: () => {
      const lines = skills
        .map(([cat, items]) => `- **${cat}:** ${items.join(", ")}`)
        .join("\n");
      return `Manikyam's technical skills cover:\n\n${lines}`;
    },
  },
  {
    id: "tools",
    exact: [
      "which tools",
      "what tools does she use",
      "tools",
      "eda tools",
    ],
    phrases: [
      { term: "which tools", weight: 4 },
      { term: "what tools", weight: 4 },
      { term: "eda tools", weight: 4 },
      { term: "verification tools", weight: 3 },
    ],
    keywords: [
      { term: "tool", weight: 3 },
      { term: "tools", weight: 3 },
      { term: "simulator", weight: 3 },
      { term: "simulators", weight: 3 },
      { term: "software", weight: 2 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () => {
      const toolsEntry = skills.find(([cat]) => cat === "Tools");
      const scriptingEntry = skills.find(([cat]) => cat === "Scripting");
      const toolsList = toolsEntry ? toolsEntry[1].join(", ") : "QuestaSim, ModelSim, Xilinx Vivado, LTspice";
      const scriptingList = scriptingEntry ? scriptingEntry[1].join(", ") : "Python, Tcl, Bash, Git";
      return `${cap(PRONOUNS.subject)} works primarily with **${toolsList}**, alongside scripting in **${scriptingList}** for simulation automation and waveform analysis.`;
    },
  },
  {
    id: "internships",
    exact: [
      "internships",
      "experience",
      `tell me about ${PRONOUNS.possessive} internships`,
      `what is ${PRONOUNS.possessive} experience`,
    ],
    phrases: [
      { term: "her internships", weight: 4 },
      { term: "work experience", weight: 4 },
      { term: "her experience", weight: 4 },
    ],
    keywords: [
      { term: "internship", weight: 3 },
      { term: "internships", weight: 3 },
      { term: "experience", weight: 3 },
      { term: "intern", weight: 2 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () => {
      const list = experience
        .map((e) => `- **${e.role}** at ${e.org} (${e.date}): ${e.points[0]}`)
        .join("\n");
      return `Manikyam completed three internships (see the Experience section):\n\n${list}`;
    },
  },
  {
    id: "contact",
    exact: [
      `how to contact ${PRONOUNS.object}`,
      `how can i contact ${PRONOUNS.object}`,
      "contact",
      "contact details",
      "email",
    ],
    phrases: [
      { term: "contact her", weight: 4 },
      { term: "reach her", weight: 4 },
      { term: "get in touch", weight: 4 },
      { term: "email address", weight: 4 },
    ],
    keywords: [
      { term: "contact", weight: 3 },
      { term: "email", weight: 3 },
      { term: "linkedin", weight: 3 },
      { term: "github", weight: 3 },
      { term: "reach", weight: 2 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () =>
      `You can reach Manikyam through the Contact section:\n\n- **Email:** ${profile.email}\n- **LinkedIn:** ${profile.linkedin}\n- **GitHub:** ${profile.github}\n- **Resume:** [View Resume](${profile.resume})`,
  },
  {
    id: "cgpa",
    exact: [
      `what is ${PRONOUNS.possessive} cgpa`,
      "cgpa",
      `${PRONOUNS.possessive} cgpa`,
      "gpa",
    ],
    phrases: [
      { term: "her cgpa", weight: 5 },
      { term: "her gpa", weight: 5 },
      { term: "what is her grade", weight: 4 },
    ],
    keywords: [
      { term: "cgpa", weight: 4 },
      { term: "gpa", weight: 4 },
      { term: "grades", weight: 3 },
      { term: "grade", weight: 3 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () =>
      `Manikyam holds a **${EXTRA_KNOWLEDGE.education.cgpa} CGPA** in ${EXTRA_KNOWLEDGE.education.degree} (${EXTRA_KNOWLEDGE.education.years}) at ${EXTRA_KNOWLEDGE.education.institution}.`,
  },
  {
    id: "open_to_work",
    exact: [
      `is ${PRONOUNS.subject} open to work`,
      "open to work",
      "availability",
      `is ${PRONOUNS.subject} available`,
    ],
    phrases: [
      { term: "open to work", weight: 5 },
      { term: "open for work", weight: 5 },
      { term: "looking for a job", weight: 4 },
      { term: "looking for roles", weight: 4 },
      { term: "available to hire", weight: 4 },
    ],
    keywords: [
      { term: "available", weight: 3 },
      { term: "availability", weight: 3 },
      { term: "hiring", weight: 3 },
      { term: "recruit", weight: 3 },
    ],
    minScore: 3,
    maxWords: 10,
    build: () =>
      `Yes — Manikyam is **${EXTRA_KNOWLEDGE.status.availability}** for **${EXTRA_KNOWLEDGE.status.targetRoles}**. You can email ${PRONOUNS.object} at ${profile.email} or view [her resume](${profile.resume}).`,
  },
  {
    id: "resume",
    exact: [
      `where is ${PRONOUNS.possessive} resume`,
      "resume",
      "cv",
      `${PRONOUNS.possessive} resume`,
    ],
    phrases: [
      { term: "her resume", weight: 5 },
      { term: "download resume", weight: 4 },
      { term: "her cv", weight: 4 },
    ],
    keywords: [
      { term: "resume", weight: 4 },
      { term: "cv", weight: 4 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () =>
      `You can open or download Manikyam's resume directly here: [Manikyam Medida Resume](${profile.resume}). It is also linked in the Hero and Contact sections.`,
  },
  {
    id: "education",
    exact: [
      "education",
      `${PRONOUNS.possessive} education`,
      "college",
      "degree",
    ],
    phrases: [
      { term: "her education", weight: 4 },
      { term: "her degree", weight: 4 },
      { term: "where did she study", weight: 4 },
      { term: "which college", weight: 4 },
    ],
    keywords: [
      { term: "education", weight: 3 },
      { term: "degree", weight: 3 },
      { term: "college", weight: 3 },
      { term: "university", weight: 3 },
      { term: "btech", weight: 3 },
      { term: "srkr", weight: 3 },
    ],
    minScore: 3,
    maxWords: 10,
    build: () =>
      `Manikyam is pursuing a **${EXTRA_KNOWLEDGE.education.degree}** (${EXTRA_KNOWLEDGE.education.years}) at **${EXTRA_KNOWLEDGE.education.institution}**, ${EXTRA_KNOWLEDGE.education.location}, with a **${EXTRA_KNOWLEDGE.education.cgpa} CGPA**.`,
  },
  {
    id: "certifications",
    exact: [
      "certifications",
      `${PRONOUNS.possessive} certifications`,
      "certs",
      "certificates",
    ],
    phrases: [
      { term: "her certifications", weight: 4 },
      { term: "her certs", weight: 4 },
    ],
    keywords: [
      { term: "certification", weight: 3 },
      { term: "certifications", weight: 3 },
      { term: "certs", weight: 3 },
      { term: "certificates", weight: 3 },
      { term: "fellowship", weight: 3 },
    ],
    minScore: 3,
    maxWords: 9,
    build: () => {
      const list = certs
        .map(([year, title, org]) => `- **${title}** — ${org} (${year})`)
        .join("\n");
      return `Manikyam's certifications and fellowships (see the Certifications section):\n\n${list}`;
    },
  },
];

// Specific sub-topic words that should go to Gemini for nuanced answers
const SPECIFIC_QUERY_GUARDS = [
  "axi",
  "ocp",
  "apb",
  "ethernet",
  "switch",
  "isro",
  "ursc",
  "elevanceskills",
  "blackbucks",
  "maven",
  "iisc",
  "scoreboard",
  "coverage",
  "waveform",
  "questasim",
  "vivado",
  "explain",
  "difference",
  "salary",
  "telugu",
  "hindi",
];

export function matchInstantAnswer(query: string): string | null {
  const norm = normalizeQuery(query);
  if (!norm) return null;

  const words = norm.split(" ");

  for (const topic of TOPICS) {
    if (topic.exact.includes(norm)) {
      return topic.build();
    }
  }

  // Let specific technical/deep questions go to Gemini
  if (words.some((w) => SPECIFIC_QUERY_GUARDS.includes(w))) {
    return null;
  }

  let bestTopic: InstantTopic | null = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    if (topic.maxWords && words.length > topic.maxWords) continue;

    let score = 0;
    for (const { term, weight } of topic.phrases) {
      if (norm.includes(term)) score += weight;
    }
    for (const { term, weight } of topic.keywords) {
      if (words.includes(term)) score += weight;
    }

    if (score >= topic.minScore && score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestTopic ? bestTopic.build() : null;
}

export function buildLocalFallbackAnswer(query: string): string {
  const words = normalizeQuery(query)
    .split(" ")
    .filter((w) => w.length >= 2);

  const lines = MEMOIZED_KNOWLEDGE.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[A-Z&\s]+$/.test(l));

  const scored = lines
    .map((line) => {
      const lower = line.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (lower.includes(word)) score += 1;
      }
      return { line, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const contactFooter = `You can also reach ${PRONOUNS.object} at ${profile.email} or on LinkedIn.`;

  if (scored.length > 0) {
    const topLines = scored.slice(0, 3).map((s) => s.line);
    return `${topLines.join("\n")}\n\n${contactFooter}`;
  }

  return `Email: ${profile.email}\nLinkedIn: ${profile.linkedin}\nResume: ${profile.resume}\n\n${contactFooter}`;
}

