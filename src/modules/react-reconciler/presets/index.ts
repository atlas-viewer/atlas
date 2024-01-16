import { defaultPreset, DefaultPresetName, DefaultPresetOptions } from './default-preset';
import { staticPreset, StaticPresetName, StaticPresetOptions } from './static-preset';
import { Preset } from './_types';

export const presets: { [key in PresetNames]: (options: any) => Preset } = {
  'default-preset': defaultPreset,
  'static-preset': staticPreset,
};

export type PresetNames = DefaultPresetName | StaticPresetName;

export type Presets =
  | readonly [DefaultPresetName, DefaultPresetOptions]
  | readonly [StaticPresetName, StaticPresetOptions];
