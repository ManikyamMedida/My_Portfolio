import {
  certs,
  experience,
  profile,
  projects,
  results,
  skills,
} from "@/lib/data";

export const PRONOUNS = {
  subject: "she",
  object: "her",
  possessive: "her",
} as const;

export const EXTRA_KNOWLEDGE = {
  education: {
    degree: "B.Tech in Electronics & Communication Engineering",
    years: "2022–2026",
    institution: "S R K R Engineering College",
    location: "Bhimavaram, Andhra Pradesh, India",
    cgpa: "9.19/10",
  },
  status: {
    availability: "Open to work",
    targetRoles:
      "Design Verification Engineer, UVM / SystemVerilog Verification, and VLSI roles",
  },
  siteGuide: [
    "Hero (#top): Overview, Projects, Resume, GitHub, LinkedIn",
    "Skills (#skills): Verification, Protocols, Design, Tools, Scripting, Semiconductors",
    "How I verify (#how): Interactive APB protocol waveform (PSEL, PENABLE, PREADY, PADDR, PWDATA)",
    "Projects (#work): AXI-to-OCP interconnect, APB UVM environment, 2x2 Ethernet switch",
    "Experience (#experience): ElevanceSkills, IIDT-Blackbucks, URSC / ISRO Bengaluru",
    "Certifications (#recognition): ElevanceSkills, Maven Silicon, ISWDP IISc Fellowship",
    "Contact (#contact): Email, LinkedIn, GitHub, Resume",
  ],
} as const;

function createKnowledge(): string {
  const sharePhone = process.env.SHARE_PHONE === "true";

  const lines: string[] = [
    "PROFILE",
    `Name: ${profile.name} (${PRONOUNS.subject}/${PRONOUNS.object})`,
    "Role: Design Verification Engineer",
    `Status: ${EXTRA_KNOWLEDGE.status.availability} for ${EXTRA_KNOWLEDGE.status.targetRoles}`,
    "",
    "EDUCATION",
    `Degree: ${EXTRA_KNOWLEDGE.education.degree} (${EXTRA_KNOWLEDGE.education.years})`,
    `College: ${EXTRA_KNOWLEDGE.education.institution}, ${EXTRA_KNOWLEDGE.education.location}`,
    `CGPA: ${EXTRA_KNOWLEDGE.education.cgpa}`,
    "",
    "CONTACT",
    `Email: ${profile.email}`,
    `LinkedIn: ${profile.linkedin}`,
    `GitHub: ${profile.github}`,
    `Resume: ${profile.resume}`,
  ];

  if (sharePhone) {
    lines.push(`Phone: ${profile.phone}`);
  }

  lines.push("", "KEY RESULTS");
  for (const item of results) {
    lines.push(`- ${item.value}${item.suffix} ${item.label}`);
  }

  lines.push("", "SKILLS & TOOLS");
  for (const [category, items] of skills) {
    lines.push(`${category}: ${items.join(", ")}`);
  }

  lines.push("", "PROJECTS");
  for (const proj of projects) {
    lines.push(`${proj.title} (${proj.date}) [${proj.stack.join(", ")}]`);
    lines.push(`Summary: ${proj.summary}`);
    for (const pt of proj.points) {
      lines.push(`- ${pt}`);
    }
  }

  lines.push("", "EXPERIENCE");
  for (const exp of experience) {
    lines.push(`${exp.role} at ${exp.org} (${exp.date})`);
    for (const pt of exp.points) {
      lines.push(`- ${pt}`);
    }
  }

  lines.push("", "CERTIFICATIONS");
  for (const [year, title, org, desc] of certs) {
    lines.push(`- ${title} — ${org} (${year}): ${desc}`);
  }

  lines.push("", "SITE GUIDE");
  for (const item of EXTRA_KNOWLEDGE.siteGuide) {
    lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

export const MEMOIZED_KNOWLEDGE = createKnowledge();

export function buildKnowledge(): string {
  return MEMOIZED_KNOWLEDGE;
}
