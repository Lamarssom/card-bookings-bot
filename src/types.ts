import type { Scenes } from 'telegraf';
import type { Update } from 'telegraf/typings/core/types/typegram';
import type { Context } from 'telegraf';

export interface BotSession extends Scenes.SceneSession<Scenes.WizardSessionData> {
  // Add custom session props here if needed in the future (e.g., for state persistence)
}

export interface BotContext extends Context<Update> {
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}