import { normalizeArrangement, type Arrangement } from "./arrangement";

export type Annotation = {
  id: string;
  pageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
};
export type ScorePage = {
  id: string;
  fileId?: string;
  demo?: number;
  pdfPage?: number;
  rotation: number;
  name: string;
  type: string;
};
export type Score = {
  id: string;
  title: string;
  artist: string;
  key: string;
  capo: number;
  tuning: string;
  tags: string[];
  status: "planned" | "practicing" | "mastered";
  favorite: boolean;
  pages: ScorePage[];
  annotations: Annotation[];
  note: string;
  createdAt: number;
  updatedAt: number;
  lastOpened: number;
  lastPage: number;
  demoId?: number;
  arrangement?: Arrangement;
};
export type ScoreLibrary = { scores: Score[]; dismissedDemoIds: string[] };
export const statusLabels = {
  planned: "想练",
  practicing: "正在练习",
  mastered: "已掌握",
};
export const DEMOS: Score[] = [
  { title: "午后练习曲", tags: ["弹唱练习", "开放和弦"], key: "C" },
  { title: "四拍之间", tags: ["换指练习", "开放和弦"], key: "C" },
  { title: "第一段分解", tags: ["六线谱", "分解和弦"], key: "G" },
].map((d, i) => ({
  id: "demo-" + i,
  ...d,
  artist: "弦间 · 原创练习",
  capo: 0,
  tuning: "E A D G B E",
  status: "planned",
  favorite: false,
  pages: [
    {
      id: "demo-page-" + i,
      demo: i,
      rotation: 0,
      name: "原创练习谱",
      type: "image/svg+xml",
    },
  ],
  annotations: [],
  note: "",
  createdAt: 0,
  updatedAt: 0,
  lastOpened: 0,
  lastPage: 0,
  demoId: i,
}));
export function pageUrl(page: ScorePage) {
  return page.fileId
    ? "/api/files/" + page.fileId
    : "/studies/study-" + (page.demo ?? 0) + ".svg";
}

export type ScorePatch = Partial<Score> | ((current: Score) => Partial<Score>);

export function normalizeScore(score: Score): Score {
  return score.arrangement
    ? { ...score, arrangement: normalizeArrangement(score.arrangement) }
    : score;
}
