// Trains the personal model from stored feature samples and saves it in settings. Used by desk mode and calibration.
import { trainPersonalModel, type PersonalModel } from '../core/classifier';
import { db, getSettings, setSettings } from './db';

export const RETRAIN_EVERY = 50;

/** Retrain when forced, or when ≥ RETRAIN_EVERY new labels arrived since the last training. */
export async function maybeRetrain(force = false): Promise<PersonalModel | null> {
  const s = await getSettings();
  const count = await db.featureSamples.count();
  if (!force && s.personalModel !== undefined && count - (s.modelTrainedOnCount ?? 0) < RETRAIN_EVERY) return s.personalModel ?? null;
  const rows = await db.featureSamples.orderBy('seq').reverse().limit(8000).toArray();
  const model = trainPersonalModel(rows);
  await setSettings({ personalModel: model, modelTrainedOnCount: count });
  return model;
}
