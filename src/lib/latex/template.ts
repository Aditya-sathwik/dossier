import { PaperSize } from "@/generated/prisma/enums";
import type { ProfileData } from "@/lib/profile";

/**
 * Escapes characters with special meaning in LaTeX: &, %, $, #, _, {, }, ~, ^, \
 */
export function escapeLatex(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\u0000BACKSLASH\u0000")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000BACKSLASH\u0000/g, "\\textbackslash{}");
}

/**
 * Ensures a link is only an approved web or mailto URL, preventing arbitrary LaTeX/command injection.
 */
export function hrefTarget(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

/**
 * Formats a month and year into a short string like "Jan 2024" or "Present".
 */
function formatDateSpan(
  startMonth: number | null,
  startYear: number | null,
  endMonth: number | null,
  endYear: number | null,
  current: boolean,
): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const start = startYear ? (startMonth ? `${MONTHS[startMonth - 1]} ${startYear}` : `${startYear}`) : "";
  if (current) return start ? `${start} -- Present` : "Present";
  const end = endYear ? (endMonth ? `${MONTHS[endMonth - 1]} ${endYear}` : `${endYear}`) : "";
  if (start && end) return `${start} -- ${end}`;
  return start || end || "";
}

/**
 * Generates an ATS-friendly, clean, single-page LaTeX resume from a candidate's profile.
 * Optimized for Tectonic / XeTeX (no pdfTeX-specific primitives).
 */
export function generateLatexFromProfile(
  profile: ProfileData,
  { paper = PaperSize.A4 }: { paper?: PaperSize } = {},
): string {
  const paperOption = paper === PaperSize.LETTER ? "letterpaper" : "a4paper";
  const { basics, experience, projects, education, skills } = profile;

  // Header items: phone, email, location, website, linkedin
  const headerLinks: string[] = [];
  if (basics.phone) headerLinks.push(escapeLatex(basics.phone));
  if (basics.email) {
    const target = hrefTarget(`mailto:${basics.email}`);
    headerLinks.push(target ? `\\href{${target}}{\\underline{${escapeLatex(basics.email)}}}` : escapeLatex(basics.email));
  }
  const loc = [basics.city, basics.country].filter(Boolean).join(", ");
  if (loc) headerLinks.push(escapeLatex(loc));
  if (basics.linkedin) {
    const target = hrefTarget(basics.linkedin.startsWith("http") ? basics.linkedin : `https://${basics.linkedin}`);
    headerLinks.push(target ? `\\href{${target}}{\\underline{linkedin}}` : escapeLatex(basics.linkedin));
  }
  if (basics.website) {
    const target = hrefTarget(basics.website.startsWith("http") ? basics.website : `https://${basics.website}`);
    const display = basics.website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    headerLinks.push(target ? `\\href{${target}}{\\underline{${escapeLatex(display)}}}` : escapeLatex(display));
  }

  // Experience entries
  const experienceBlocks: string[] = [];
  for (const exp of experience) {
    const dates = formatDateSpan(exp.startMonth, exp.startYear, exp.endMonth, exp.endYear, exp.current);
    const bullets = exp.bullets
      .split("\n")
      .map((b) => b.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const bulletItems = bullets.map((b) => `        \\resumeItem{${escapeLatex(b)}}`).join("\n");

    experienceBlocks.push(`    \\resumeSubheading
      {${escapeLatex(exp.role || "Role")}}{${escapeLatex(dates)}}
      {${escapeLatex(exp.company || "Company")}}{${escapeLatex(exp.location || "")}}
      \\resumeItemListStart
${bulletItems || "        \\resumeItem{Contributed to team deliverables and software projects.}"}
      \\resumeItemListEnd`);
  }

  // Projects entries
  const projectBlocks: string[] = [];
  for (const proj of projects) {
    const dates = formatDateSpan(proj.startMonth, proj.startYear, proj.endMonth, proj.endYear, proj.current);
    const bullets = proj.bullets
      .split("\n")
      .map((b) => b.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const target = proj.link ? hrefTarget(proj.link.startsWith("http") ? proj.link : `https://${proj.link}`) : "";
    const nameFormatted = target
      ? `\\href{${target}}{\\underline{${escapeLatex(proj.name)}}}`
      : `\\textbf{${escapeLatex(proj.name)}}`;

    const bulletItems = bullets.map((b) => `        \\resumeItem{${escapeLatex(b)}}`).join("\n");

    projectBlocks.push(`    \\resumeProjectHeading
      {${nameFormatted}}{${escapeLatex(dates)}}
      \\resumeItemListStart
${bulletItems || "        \\resumeItem{Developed project features and documentation.}"}
      \\resumeItemListEnd`);
  }

  // Education entries
  const educationBlocks: string[] = [];
  for (const edu of education) {
    const dates = formatDateSpan(edu.startMonth, edu.startYear, edu.endMonth, edu.endYear, false);
    const notesLine = edu.notes ? `\n      \\resumeItemListStart\n        \\resumeItem{${escapeLatex(edu.notes)}}\n      \\resumeItemListEnd` : "";
    educationBlocks.push(`    \\resumeSubheading
      {${escapeLatex(edu.school || "University")}}{${escapeLatex(dates)}}
      {${escapeLatex(edu.degree || "Degree")}}{}${notesLine}`);
  }

  // Skills grouped
  const skillsByGroup = new Map<string, string[]>();
  for (const s of skills) {
    const groupName = s.group.trim() || "Technical Skills";
    const list = skillsByGroup.get(groupName) ?? [];
    list.push(s.name);
    skillsByGroup.set(groupName, list);
  }

  const skillLines: string[] = [];
  for (const [group, items] of skillsByGroup.entries()) {
    skillLines.push(`     \\textbf{${escapeLatex(group)}}{: ${escapeLatex(items.join(", "))}} \\\\`);
  }

  const nameEscaped = escapeLatex(basics.name.trim() || "Your Name");

  return `%-------------------------
% Resume in LaTeX
% Based on Jake Gutierrez's template (XeTeX / Tectonic compatible)
% License: MIT
%------------------------

\\documentclass[${paperOption},11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% Adjust margins
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Sections formatting
\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

%-------------------------
% Custom commands
\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}

\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\\begin{document}

%----------HEADING----------
\\begin{center}
    \\textbf{\\Huge \\scshape ${nameEscaped}} \\\\ \\vspace{1pt}
    \\small ${headerLinks.join(" $|$ ")}
\\end{center}

${
  basics.summary.trim()
    ? `%-----------SUMMARY-----------
\\section{Summary}
\\small{${escapeLatex(basics.summary.trim())}}
`
    : ""
}${
    educationBlocks.length > 0
      ? `%-----------EDUCATION-----------
\\section{Education}
  \\resumeSubHeadingListStart
${educationBlocks.join("\n")}
  \\resumeSubHeadingListEnd
`
      : ""
  }${
    experienceBlocks.length > 0
      ? `%-----------EXPERIENCE-----------
\\section{Experience}
  \\resumeSubHeadingListStart
${experienceBlocks.join("\n")}
  \\resumeSubHeadingListEnd
`
      : ""
  }${
    projectBlocks.length > 0
      ? `%-----------PROJECTS-----------
\\section{Projects}
  \\resumeSubHeadingListStart
${projectBlocks.join("\n")}
  \\resumeSubHeadingListEnd
`
      : ""
  }${
    skillLines.length > 0
      ? `%-----------PROGRAMMING SKILLS-----------
\\section{Technical Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
${skillLines.join("\n")}
    }}
 \\end{itemize}
`
      : ""
  }
\\end{document}
`;
}
