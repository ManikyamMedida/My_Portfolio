export const profile = {
  name: "Manikyam Medida",
  email: "medida.manikyam@gmail.com",
  phone: "+91 8555073719",
  linkedin: "https://linkedin.com/in/manikyammedida",
  github: "https://github.com/ManikyamMedida",
  resume: "/Manikyam_Medida_Resume.pdf",
};

export const results = [
  { value: 60, suffix: "/60", label: "scoreboard passes in the APB environment" },
  { value: 100, suffix: "%", label: "of the defined functional coverage model hit" },
  { value: 0, suffix: "", label: "UVM errors or fatals across the APB regression" },
  { value: 10, suffix: "×", label: "faster FFT-based convolution on 14,000+ samples at ISRO" },
];

export const projects = [
  {
    title: "AXI-to-OCP interconnect verification",
    date: "Sep 2026",
    stack: ["SystemVerilog", "UVM", "QuestaSim"],
    summary: "A reusable UVM environment for an interconnect with two AXI masters and one OCP slave.",
    points: [
      "Agents, sequence items, sequencers, drivers, monitors, scoreboard and virtual sequences, connected through TLM.",
      "Constrained-random stimulus to exercise AXI handshaking, arbitration and AXI-to-OCP conversion.",
      "Debugged response paths from simulation logs and waveforms.",
    ],
  },
  {
    title: "APB UVM verification environment",
    date: "Aug 2026",
    stack: ["SystemVerilog", "UVM", "QuestaSim"],
    summary: "Modular APB testbench with an APB slave BFM, functional coverage and assertions.",
    points: [
      "Constrained-random reads and writes, wait states and error responses, checked by protocol assertions.",
      "60/60 scoreboard passes with 0 UVM errors or fatals.",
      "100% coverage of the defined functional coverage model.",
    ],
  },
  {
    title: "2×2 Ethernet switch design and verification",
    date: "Jul 2026",
    stack: ["SystemVerilog", "QuestaSim"],
    summary: "A 2×2 switch routing packets by destination, verified with an OOP testbench.",
    points: [
      "Checked SOP/EOP framing, variable packet lengths and concurrent traffic.",
      "Packet, generator, driver, monitor and checker classes joined by mailboxes, virtual interfaces and clocking blocks.",
      "SystemVerilog assertions for framing, plus functional coverage and regression runs.",
    ],
  },
];

export const experience = [
  {
    role: "VLSI Intern",
    org: "ElevanceSkills",
    date: "Sep 2026",
    image: "/exp/exp-elevance.jpg",
    points: [
      "Building an adaptive multi-junction traffic signal controller with FSM modelling.",
      "RTL design, testbench development and simulation in ModelSim.",
      "Debugging RTL behaviour from simulation waveforms.",
    ],
  },
  {
    role: "VLSI & Semiconductors Intern",
    org: "IIDT-Blackbucks",
    date: "May – Jul 2025",
    image: "/exp/exp-iidt.jpg",
    points: [
      "Wrote and simulated Verilog RTL modules and testbenches, validated through waveform analysis.",
      "Designed an N-bit universal shift register (parallel load, shift left, shift right, hold) from flip-flops and 4×1 muxes.",
    ],
  },
  {
    role: "Digital Signal Processing Intern",
    org: "URSC / ISRO, Bengaluru",
    date: "Apr 2025",
    image: "/exp/exp-isro.jpg",
    points: [
      "Transient signal analysis and device characterization with the Continuous Wavelet Transform for satellite DSP.",
      "FFT-based convolution that ran 10× faster on more than 14,000 samples at 10 kHz.",
    ],
  },
];

export const skills: [string, string[]][] = [
  ["Verification", ["SystemVerilog", "UVM", "OOP", "Constrained randomization", "Assertions", "Functional coverage", "Regression testing", "Testbench development"]],
  ["Protocols", ["APB", "AXI", "AHB"]],
  ["Design", ["Verilog", "RTL design", "FSM", "FPGA", "DFT", "ASIC and SoC basics", "Computer architecture"]],
  ["Tools", ["QuestaSim", "ModelSim", "Cadence Virtuoso", "Xilinx Vivado"]],
  ["Scripting", ["Python", "TCL", "C", "Linux"]],
  ["Semiconductors", ["CMOS fabrication", "Device physics", "Digital electronics"]],
];

export const certs: [string, string, string, string][] = [
  ["2026", "VLSI project training", "ElevanceSkills", "Verilog HDL, RTL design, FSM modelling, testbenches and ModelSim/Vivado simulation."],
  ["2026", "Foundation: Design for Testability", "Maven Silicon", "Scan chains, ATPG, boundary scan, fault modelling and VLSI testing."],
  ["2025", "ISWDP Samsung Student Fellowship", "IISc, with Synopsys and Samsung", "Device physics, CMOS fabrication and TCAD simulation. Top 5% of Level 1 performers."],
  ["2025", "Verilog HDL hands-on certification", "Maven Silicon", "Practical RTL design in Verilog."],
];
