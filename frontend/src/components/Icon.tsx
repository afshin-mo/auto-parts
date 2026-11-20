const P: Record<string, string> = {
  gauge: 'M12 14l4-5M3 16a9 9 0 1118 0M7 19h10',
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9zM3 7.5L12 12l9-4.5M12 12v9',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM17.5 19a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 4.5a3.5 3.5 0 010 6.5M19 14c2 .8 3 2.6 3 5',
  warehouse: 'M3 9l9-5 9 5v11H3V9zM8 20v-6h8v6M8 17h8',
  cheque: 'M3 6h18v12H3zM6 10h8M6 14h5M16 14l1.5 1.5L20 12',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  car: 'M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2h3v-2M17 16v2h3v-2M7 12h10',
  cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1.2-1.5-2.6-2.3.6a7 7 0 00-1.6-.9L15 5.5h-3L11.5 7.9a7 7 0 00-1.6.9l-2.3-.6L6 10.8 8 12a7 7 0 000 1.8l-2 1.2 1.5 2.6 2.3-.6c.5.4 1 .7 1.6.9l.5 2.4h3l.5-2.4c.6-.2 1.1-.5 1.6-.9l2.3.6 1.5-2.6-2-1.2c.1-.6.1-1.2 0-1.8z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  x: 'M6 6l12 12M18 6L6 18',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  out: 'M10 4H4v16h6M15 8l4 4-4 4M19 12H9',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l12-3v3M17 13.5h2',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1',
  check: 'M4 12.5l5 5L20 6.5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8v8M12 8v8M16 8v8',
  building: 'M4 21V6l8-3 8 3v15M4 21h16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  menu: 'M4 7h16M4 12h16M4 17h16',
};
export type IconName = keyof typeof P;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}
