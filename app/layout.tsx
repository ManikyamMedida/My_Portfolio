import type { Metadata } from "next";
import { Crimson_Pro, Public_Sans, Space_Grotesk } from "next/font/google";
import MotionProvider from "@/components/MotionProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-sans",
});

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["200", "400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "Manikyam Medida | Design Verification Engineer",
  description:
    "UVM and SystemVerilog verification for APB, AXI and Ethernet designs. B.Tech ECE, CGPA 9.19.",
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Manikyam Medida | Design Verification Engineer",
    description:
      "UVM and SystemVerilog verification for APB, AXI and Ethernet designs.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${crimsonPro.variable} ${publicSans.variable}`}
    >
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
