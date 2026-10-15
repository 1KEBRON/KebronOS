export type OceanSound = {
  readonly on: boolean;
  enable(): Promise<void>;
  disable(): void;
  setScene(next: { height?: number; wave?: number; wind?: number }): void;
  open(): void;
  close(): void;
};
export function createOceanSound(): OceanSound | null;
