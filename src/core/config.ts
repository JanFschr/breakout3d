export interface AppConfig {
  readonly maxPixelRatio: number;
  readonly background: number;
}

export const APP_CONFIG: AppConfig = {
  maxPixelRatio: 2,
  background: 0xeafcff,
};
