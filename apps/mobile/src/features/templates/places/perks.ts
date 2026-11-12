import type {
  HabitChartsResponse,
  HabitChartsSettings,
  PiggyBankResponse,
  PiggyBankSettings,
  SaturdayJarResponse,
  SaturdayJarSettings,
  SecretMissionsResponse,
  SecretMissionsSettings,
  SleepsResponse,
  SleepsSettings,
  Template,
  WhereIsItResponse,
  WhereIsItSettings,
  WhoseTurnResponse,
  WhoseTurnSettings,
} from '@/api/generated/homeport';
import { HabitCharts } from '@/features/perks/habit-charts/HabitCharts';
import { PiggyBank } from '@/features/perks/piggy-bank/PiggyBank';
import { PiggyBankSetup } from '@/features/perks/piggy-bank/PiggyBankSetup';
import { SaturdayJar } from '@/features/perks/saturday-jar/SaturdayJar';
import { SecretMissions } from '@/features/perks/secret-missions/SecretMissions';
import { Sleeps } from '@/features/perks/sleeps/Sleeps';
import { WhereIsIt } from '@/features/perks/where-is-it/WhereIsIt';
import { WhoseTurn } from '@/features/perks/whose-turn/WhoseTurn';

import { type AnyBuiltTemplate, template } from '../types';

/**
 * Fair and fun (16): the templates that do work drawn in `design/hub/src/screens/perks.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const perksTemplates = {
  whose_turn: template<WhoseTurnResponse, WhoseTurnSettings>(WhoseTurn),
  piggy_bank: template<PiggyBankResponse, PiggyBankSettings>(PiggyBank, PiggyBankSetup),
  secret_missions: template<SecretMissionsResponse, SecretMissionsSettings>(SecretMissions),
  saturday_jar: template<SaturdayJarResponse, SaturdayJarSettings>(SaturdayJar),
  sleeps: template<SleepsResponse, SleepsSettings>(Sleeps),
  where_is_it: template<WhereIsItResponse, WhereIsItSettings>(WhereIsIt),
  habit_charts: template<HabitChartsResponse, HabitChartsSettings>(HabitCharts),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
