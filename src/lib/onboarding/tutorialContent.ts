// Tutorial onboarding content — 10 ad-agency-themed demo projects seeded into
// every new user's account on first login. Each project is a client engagement
// with 3-7 dated touchpoints (nodes), plus optional forward-looking ambitions,
// plus tags drawn from a small seeded catalog. The first three projects carry
// an amber tutorial note explaining a feature.
//
// Dates are DAY OFFSETS from "today" at seed time. Nodes must be <= 0 (past
// or today); future things go in `ambitions`.

export type TutorialNode = {
  title: string;
  /** Days from today; must be <= 0 (nodes are things that have happened). */
  dayOffset: number;
  /** Tag values (matched by `value` text in the seeded catalog). */
  tags?: string[];
};

export type TutorialAmbition = {
  title: string;
  /** Days from today; must be > 0 (ambitions are future). */
  dayOffset: number;
  /** When true, the ambition is also a deadline (countdown circle). */
  isDeadline?: boolean;
};

export type TutorialNote = {
  body: string;
  /** Pixels above (negative) or below the lane centre. */
  yOffset: number;
  /** Days from the anchor node along the timeline (positive = to the right). */
  anchorDayOffset: number;
};

export type TutorialProject = {
  name: string;
  /** Project-level tag values. */
  tags?: string[];
  ambitions?: TutorialAmbition[];
  note?: TutorialNote;
  nodes: TutorialNode[];
};

// Tag catalog seeded for the user (defensively: reuses categories/values that
// already exist by name, so re-running won't create duplicates). Categories
// chosen to make filtering meaningful for the agency-themed demo:
// - "Discipline" groups projects by type of work (Brand/Campaign/Digital/Production)
// - "Team lead" groups them by responsible person
// - "Spam" / "Not important" are the standard hide-filter categories
export type TutorialTagCategory = {
  name: string;
  sortOrder: number;
  isHide: boolean;
  values: { value: string; color: string }[];
};

export const TUTORIAL_TAG_CATEGORIES: TutorialTagCategory[] = [
  {
    name: "Discipline",
    sortOrder: 0,
    isHide: false,
    values: [
      { value: "Brand", color: "#8a5a6f" },
      { value: "Campaign", color: "#c2622a" },
      { value: "Digital", color: "#5a7d8c" },
      { value: "Production", color: "#9c6b4a" },
    ],
  },
  {
    name: "Team lead",
    sortOrder: 1,
    isHide: false,
    values: [
      { value: "Maya", color: "#8a9a72" },
      { value: "Jordan", color: "#b8902f" },
      { value: "Sam", color: "#6b8e6b" },
    ],
  },
  {
    name: "Spam",
    sortOrder: 2,
    isHide: true,
    values: [{ value: "Junk", color: "#71717a" }],
  },
  {
    name: "Not important",
    sortOrder: 3,
    isHide: true,
    values: [{ value: "Low priority", color: "#52525b" }],
  },
];

export const TUTORIAL_PROJECTS: TutorialProject[] = [
  {
    name: "Acme Beverages — Spring Campaign",
    tags: ["Campaign", "Maya"],
    ambitions: [{ title: "Wrap report due", dayOffset: 20 }],
    note: {
      body:
        "Welcome to Sirmathread. Each row is a project; each square is a milestone. " +
        "When you're done with one, click the project name on the left to Archive it " +
        "(hides it) or Delete it permanently. Try it on this project once you're done exploring.",
      yOffset: -82,
      anchorDayOffset: 5,
    },
    nodes: [
      { title: "Brief received", dayOffset: -84 },
      { title: "Kick-off call", dayOffset: -78 },
      { title: "Concepts presented", dayOffset: -60 },
      { title: "Round 1 feedback", dayOffset: -45 },
      { title: "Production sign-off", dayOffset: -22, tags: ["Maya"] },
      { title: "Final files delivered", dayOffset: -8 },
    ],
  },
  {
    name: "Vox Athletic — Brand Refresh",
    tags: ["Brand", "Maya"],
    note: {
      body:
        "Notes are amber boxes like this one, pinned to a project's latest milestone. " +
        "To add your own: click the + next to any project, choose Note, and drop in some " +
        "text. Drag a note anywhere — your placement is saved.",
      yOffset: -82,
      anchorDayOffset: 5,
    },
    nodes: [
      { title: "Discovery workshop", dayOffset: -72 },
      { title: "Mood boards", dayOffset: -58 },
      { title: "Logo direction picked", dayOffset: -40 },
      { title: "Guidelines draft", dayOffset: -18 },
      { title: "Stakeholder review", dayOffset: -3 },
    ],
  },
  {
    name: "Nimbus Tech — Product Launch",
    tags: ["Campaign", "Digital", "Jordan"],
    ambitions: [{ title: "Post-launch review", dayOffset: 12, isDeadline: true }],
    note: {
      body:
        "Top toolbar: Arrange sorts projects (by deadline, most recent, etc.). Filters " +
        "narrows what you see by status or tag. Find — top-left — searches every project " +
        "and milestone by name. Hit Enter from anywhere to open it.",
      yOffset: -86,
      anchorDayOffset: 6,
    },
    nodes: [
      { title: "Positioning workshop", dayOffset: -68 },
      { title: "Messaging draft", dayOffset: -54 },
      { title: "Launch deck v1", dayOffset: -38 },
      { title: "Press list locked", dayOffset: -20, tags: ["Jordan", "Digital"] },
      { title: "Embargo lifts", dayOffset: -5, tags: ["Jordan"] },
    ],
  },
  {
    name: "Tessera Hotels — Summer Push",
    tags: ["Campaign", "Jordan"],
    ambitions: [{ title: "Campaign goes live", dayOffset: 8, isDeadline: true }],
    nodes: [
      { title: "Brief from CMO", dayOffset: -76 },
      { title: "Audience workshop", dayOffset: -62 },
      { title: "Creative concepts", dayOffset: -44 },
      { title: "Media plan signed", dayOffset: -25, tags: ["Jordan"] },
    ],
  },
  {
    name: "Helix Health — Awareness Campaign",
    tags: ["Campaign", "Sam"],
    ambitions: [{ title: "Compliance final approval", dayOffset: 18, isDeadline: true }],
    nodes: [
      { title: "Compliance kickoff", dayOffset: -88 },
      { title: "Script v1", dayOffset: -70 },
      { title: "Medical-legal review", dayOffset: -52 },
      { title: "Shoot day", dayOffset: -30 },
      { title: "Cut delivered", dayOffset: -11 },
    ],
  },
  {
    name: "Polaris Auto — Dealer Co-op",
    tags: ["Production", "Jordan"],
    ambitions: [
      { title: "Rollout begins", dayOffset: 6, isDeadline: true },
      { title: "All dealers onboarded", dayOffset: 25 },
    ],
    nodes: [
      { title: "Co-op brief", dayOffset: -64 },
      { title: "Regional asset list", dayOffset: -48 },
      { title: "First proof round", dayOffset: -28 },
      { title: "Dealer approvals", dayOffset: -10, tags: ["Jordan", "Production", "Maya", "Sam"] },
    ],
  },
  {
    name: "Riveroak Estates — Listings Refresh",
    tags: ["Production", "Sam"],
    nodes: [
      { title: "Photography brief", dayOffset: -56 },
      { title: "Shoot scheduled", dayOffset: -42 },
      { title: "Copy edits", dayOffset: -19 },
    ],
  },
  {
    name: "Quill Press — Catalogue Q3",
    tags: ["Production", "Sam"],
    ambitions: [
      { title: "Sample copies in", dayOffset: 3 },
      { title: "Distribution drop", dayOffset: 18, isDeadline: true },
    ],
    nodes: [
      { title: "Title list received", dayOffset: -82 },
      { title: "Cover treatments", dayOffset: -66 },
      { title: "Layout review", dayOffset: -50 },
      { title: "Proofread", dayOffset: -32 },
      { title: "To printer", dayOffset: -14 },
    ],
  },
  {
    name: "Sundara Foods — Packaging Redesign",
    tags: ["Brand", "Maya"],
    ambitions: [{ title: "Production handover", dayOffset: 10 }],
    nodes: [
      { title: "Range audit", dayOffset: -74 },
      { title: "Concept directions", dayOffset: -58 },
      { title: "Shelf test", dayOffset: -36 },
      { title: "Production artwork", dayOffset: -12, tags: ["Maya"] },
    ],
  },
  {
    name: "Boréal Outdoor — Seasonal Lookbook",
    tags: ["Brand", "Sam"],
    ambitions: [
      { title: "Retail handoff", dayOffset: 14, isDeadline: true },
      { title: "Spring lookbook brief", dayOffset: 28 },
    ],
    nodes: [
      { title: "Trend research", dayOffset: -70 },
      { title: "Location scout", dayOffset: -54 },
      { title: "Shot list locked", dayOffset: -38 },
      { title: "Shoot week", dayOffset: -22 },
      { title: "Lookbook layout", dayOffset: -6 },
    ],
  },
];
