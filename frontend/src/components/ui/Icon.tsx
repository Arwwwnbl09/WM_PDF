type IconName =
  | "shield"
  | "upload"
  | "file"
  | "close"
  | "check"
  | "arrow"
  | "sliders"
  | "eye"
  | "lock";
const paths: Record<IconName, string> = {
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
  upload: "M12 16V3m-5 5 5-5 5 5 M4 15v5h16v-5",
  file: "M14 2H5v20h14V7l-5-5Z M14 2v5h5 M8 12h8 M8 16h6",
  close: "m6 6 12 12 M18 6 6 18",
  check: "m5 12 4 4 10-10",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  sliders: "M5 3v7m0 4v7M12 3v12m0 4v2M19 3v3m0 4v11 M2 10h6m1 5h6m1-9h6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  lock: "M6 10h12v11H6V10Z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
