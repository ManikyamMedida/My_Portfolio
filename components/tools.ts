import React from "react";
import { SiArm, SiSiemens } from "react-icons/si";

export type LogoProps = { size?: number };
export type LogoComp = React.ComponentType<LogoProps>;

function makeSvgLogo(src: string): LogoComp {
  return function TechSvg({ size = 88 }: LogoProps) {
    return React.createElement("img", {
      src,
      alt: "",
      width: size,
      height: size,
      className: "tech-logo-img",
      loading: "lazy",
      decoding: "async",
      "aria-hidden": true,
    });
  };
}

function makeBrandIcon(Icon: React.ComponentType<{ size?: number; color?: string }>, color: string): LogoComp {
  return function BrandIcon({ size = 88 }: LogoProps) {
    return React.createElement(Icon, { size, color });
  };
}

export interface TechnologySpec {
  name: string;
  Logo: LogoComp;
  glow: string;
  desc: string;
}

const specs: TechnologySpec[] = [
  // Verification
  {
    name: "SystemVerilog",
    Logo: makeSvgLogo("/logos/systemverilog.svg"),
    glow: "rgba(37, 99, 235, 0.36)",
    desc: "IEEE 1800 HDL for interfaces, assertions and OOP testbenches.",
  },
  {
    name: "UVM",
    Logo: makeSvgLogo("/logos/uvm.svg"),
    glow: "rgba(34, 197, 94, 0.36)",
    desc: "Universal Verification Methodology with agents, sequencers and TLM.",
  },
  {
    name: "OOP",
    Logo: makeSvgLogo("/logos/oop.svg"),
    glow: "rgba(139, 92, 246, 0.36)",
    desc: "Reusable class hierarchies, factory overrides and polymorphism.",
  },
  {
    name: "Constrained randomization",
    Logo: makeSvgLogo("/logos/constrained-random.svg"),
    glow: "rgba(236, 72, 153, 0.36)",
    desc: "Constrained-random stimulus generation for corner-case stress.",
  },
  {
    name: "Assertions",
    Logo: makeSvgLogo("/logos/assertions.svg"),
    glow: "rgba(16, 185, 129, 0.36)",
    desc: "Cycle-accurate SVA temporal properties and protocol checkers.",
  },
  {
    name: "Functional coverage",
    Logo: makeSvgLogo("/logos/functional-coverage.svg"),
    glow: "rgba(56, 189, 248, 0.36)",
    desc: "Covergroups, bins and cross-coverage models for 100% closure.",
  },
  {
    name: "Regression testing",
    Logo: makeSvgLogo("/logos/regression-testing.svg"),
    glow: "rgba(2, 132, 199, 0.36)",
    desc: "Multi-seed automated regression runs and log verification.",
  },
  {
    name: "Testbench development",
    Logo: makeSvgLogo("/logos/testbench.svg"),
    glow: "rgba(124, 58, 237, 0.36)",
    desc: "Self-checking layered testbenches with drivers, monitors and scoreboards.",
  },

  // Protocols
  {
    name: "APB",
    Logo: makeSvgLogo("/logos/apb.svg"),
    glow: "rgba(0, 145, 189, 0.36)",
    desc: "AMBA APB setup/access phases, wait states and PSLVERR checks.",
  },
  {
    name: "AXI",
    Logo: makeBrandIcon(SiArm, "#0091BD"),
    glow: "rgba(0, 145, 189, 0.4)",
    desc: "AMBA AXI split channels, VALID/READY handshakes and bursts.",
  },
  {
    name: "AHB",
    Logo: makeSvgLogo("/logos/ahb.svg"),
    glow: "rgba(217, 119, 6, 0.36)",
    desc: "Pipelined AMBA AHB address/data bus transfers and arbitration.",
  },

  // Design
  {
    name: "Verilog",
    Logo: makeSvgLogo("/logos/verilog.svg"),
    glow: "rgba(245, 158, 11, 0.36)",
    desc: "Synthesizable Verilog RTL modules and structural hardware design.",
  },
  {
    name: "RTL design",
    Logo: makeSvgLogo("/logos/rtl-design.svg"),
    glow: "rgba(14, 165, 233, 0.36)",
    desc: "Register-transfer pipelines, mux datapaths and control logic.",
  },
  {
    name: "FSM",
    Logo: makeSvgLogo("/logos/fsm.svg"),
    glow: "rgba(139, 92, 246, 0.36)",
    desc: "Mealy & Moore finite state machine modelling and verification.",
  },
  {
    name: "FPGA",
    Logo: makeSvgLogo("/logos/fpga.svg"),
    glow: "rgba(239, 68, 68, 0.36)",
    desc: "FPGA synthesis, LUT/routing flow and hardware implementation.",
  },
  {
    name: "DFT",
    Logo: makeSvgLogo("/logos/dft.svg"),
    glow: "rgba(16, 185, 129, 0.36)",
    desc: "Scan chains, boundary scan, ATPG and fault modelling basics.",
  },
  {
    name: "ASIC and SoC basics",
    Logo: makeSvgLogo("/logos/asic-soc.svg"),
    glow: "rgba(192, 132, 252, 0.36)",
    desc: "SoC bus interconnects, subsystem blocks and ASIC flow fundamentals.",
  },
  {
    name: "Computer architecture",
    Logo: makeSvgLogo("/logos/computer-arch.svg"),
    glow: "rgba(59, 130, 246, 0.36)",
    desc: "ALU datapaths, pipelines, memory buses and bus arbitration.",
  },

  // Tools
  {
    name: "QuestaSim",
    Logo: makeBrandIcon(SiSiemens, "#009999"),
    glow: "rgba(0, 153, 153, 0.42)",
    desc: "Siemens QuestaSim for SystemVerilog/UVM and coverage closure.",
  },
  {
    name: "ModelSim",
    Logo: makeSvgLogo("/logos/modelsim.svg"),
    glow: "rgba(6, 182, 212, 0.38)",
    desc: "ModelSim RTL compilation and waveform signal debugging.",
  },
  {
    name: "Cadence Virtuoso",
    Logo: makeSvgLogo("/logos/cadence.svg"),
    glow: "rgba(238, 49, 36, 0.4)",
    desc: "Cadence schematic capture and transistor-level CMOS layout.",
  },
  {
    name: "Xilinx Vivado",
    Logo: makeSvgLogo("/logos/amd-vivado.svg"),
    glow: "rgba(237, 28, 36, 0.4)",
    desc: "AMD/Xilinx Vivado FPGA synthesis, timing and simulation.",
  },

  // Scripting
  {
    name: "Python",
    Logo: makeSvgLogo("/logos/python.svg"),
    glow: "rgba(55, 118, 171, 0.42)",
    desc: "Automation scripts, log parsing and FFT/CWT signal processing.",
  },
  {
    name: "TCL",
    Logo: makeSvgLogo("/logos/tcl.svg"),
    glow: "rgba(37, 99, 235, 0.38)",
    desc: "EDA simulation run-scripts and Vivado batch automation.",
  },
  {
    name: "C",
    Logo: makeSvgLogo("/logos/c-lang.svg"),
    glow: "rgba(0, 89, 156, 0.42)",
    desc: "Procedural systems code, bit-level models and firmware basics.",
  },
  {
    name: "Linux",
    Logo: makeSvgLogo("/logos/linux.svg"),
    glow: "rgba(252, 198, 36, 0.38)",
    desc: "CLI toolchains, shell pipelines and EDA regression environments.",
  },

  // Semiconductors
  {
    name: "CMOS fabrication",
    Logo: makeSvgLogo("/logos/cmos.svg"),
    glow: "rgba(56, 189, 248, 0.36)",
    desc: "PMOS/NMOS fabrication steps, wells and photolithography basics.",
  },
  {
    name: "Device physics",
    Logo: makeSvgLogo("/logos/device-physics.svg"),
    glow: "rgba(244, 63, 94, 0.36)",
    desc: "P-N junctions, MOSFET carrier transport and TCAD simulation.",
  },
  {
    name: "Digital electronics",
    Logo: makeSvgLogo("/logos/digital-electronics.svg"),
    glow: "rgba(34, 197, 94, 0.36)",
    desc: "Combinational gates, flip-flops, setup/hold timing and logic.",
  },
];

const byName = new Map(specs.map((s) => [s.name.toLowerCase(), s]));

export const techFor = (name: string): TechnologySpec =>
  byName.get(name.toLowerCase()) ?? {
    name,
    Logo: makeSvgLogo("/logos/systemverilog.svg"),
    glow: "rgba(255, 255, 255, 0.25)",
    desc: name,
  };
