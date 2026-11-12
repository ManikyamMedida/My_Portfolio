import fs from "node:fs";
import path from "node:path";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Scope from "@/components/Scope";
import SmoothScroll from "@/components/SmoothScroll";
import AgentWidget from "@/components/agent/AgentWidget";
import { Results, Skills, Work, Experience, Recognition, Contact } from "@/components/Sections";

function resolvePortraitSrc(): string | null {
  const pubDir = path.join(process.cwd(), "public");
  if (fs.existsSync(path.join(pubDir, "profile.webp"))) return "/profile.webp";
  if (fs.existsSync(path.join(pubDir, "profile.png"))) return "/profile.png";
  if (fs.existsSync(path.join(pubDir, "profile.jpg"))) return "/profile.jpg";
  return null;
}

export default function Page() {
  const portraitSrc = resolvePortraitSrc();

  return (
    <>
      <div className="page-grain" aria-hidden="true" />
      <SmoothScroll />
      <Nav />
      <main>
        <Hero portraitSrc={portraitSrc} />
        <Results />
        <Skills />
        <Scope />
        <Work />
        <Experience />
        <Recognition />
        <Contact />
      </main>
      <AgentWidget />
    </>
  );
}
