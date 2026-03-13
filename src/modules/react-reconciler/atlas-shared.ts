import type { Preset } from './presets/_types';

export type AtlasWorldKey = string | number | undefined;

export type AtlasCreatedMeta = {
  stage: 'active' | 'staging';
  worldKey?: string | number;
};

export type AtlasOnCreated = (ctx: Preset, meta?: AtlasCreatedMeta) => void | Promise<void>;
