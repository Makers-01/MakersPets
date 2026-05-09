import type { PetStageState } from "@/components/pet/makers-pet-stage";

type Frame = {
  row: number;
  col: number;
};

type PetAssetConfig = {
  id: string;
  imagePath: string;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  stateFps?: Partial<Record<PetStageState, number>>;
  stateFrames: Record<PetStageState, Frame[]>;
};

function rowFrames(row: number, columns = 8) {
  return Array.from({ length: columns }, (_, col) => ({
    row,
    col
  }));
}

export const petAssets: Record<string, PetAssetConfig> = {
  makers: {
    id: "makers",
    imagePath: "/pets/makers/spritesheet.webp",
    columns: 8,
    rows: 9,
    frameWidth: 192,
    frameHeight: 208,
    fps: 3.4,
    stateFps: {
      idle: 2.6,
      listening: 3,
      thinking: 3.2,
      celebrating: 3.8,
      nudging: 2.8,
      "running-left": 5.2,
      "running-right": 5.2
    },
    stateFrames: {
      idle: rowFrames(0, 6),
      "running-right": rowFrames(1, 8),
      "running-left": rowFrames(2, 8),
      listening: rowFrames(7, 6),
      thinking: rowFrames(8, 6),
      celebrating: rowFrames(3, 4),
      nudging: rowFrames(6, 6)
    }
  }
};

export function getPetAssetConfig(petId = "makers") {
  return petAssets[petId] ?? petAssets.makers;
}
