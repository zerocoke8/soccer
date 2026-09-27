/**
 * rating.js — 런 종료 평가 (ARCHITECTURE §6.9).
 *
 *   avgStat = Σ(7명 5스탯, 적성 배율 미적용) / 35
 *   score   = avgStat + skillValue × (learned 스킬 수) + teamworkWeight × teamwork
 *   grade   = thresholds 로 결정, cappedGrade = min(grade, capByLosses[min(losses, 3)])
 */
import { STATS } from "./training.js";

/** 등급 순서 (높은 것부터) */
export const GRADE_ORDER = ["S", "A", "B", "C", "D", "E", "F", "G"];

/**
 * @typedef {Object} Rating
 * @property {number} score
 * @property {string} grade
 * @property {string} cappedGrade
 * @property {{ avgStat: number, learnedSkills: number, skillScore: number, teamwork: number, teamworkScore: number,
 *              losses: number, cap: string, goalMatches: Array<object>, friendlies: Array<object>,
 *              perPlayer: Array<{ id: string, name: string, slot: string, total: number }> }} breakdown
 */

/**
 * 점수 → 등급. thresholds 예: { S: 700, A: 600, … , G: 0 }
 * @param {number} score
 * @param {Record<string, number>} thresholds
 * @returns {string}
 */
export function gradeFromScore(score, thresholds) {
  const entries = Object.entries(thresholds).sort((a, b) => b[1] - a[1]);
  for (const [grade, min] of entries) {
    if (score >= min) return grade;
  }
  return entries.length ? entries[entries.length - 1][0] : "G";
}

/**
 * 두 등급 중 낮은 것.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function lowerGrade(a, b) {
  const ia = GRADE_ORDER.indexOf(a);
  const ib = GRADE_ORDER.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

/**
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {Rating}
 */
export function computeRating(state, data) {
  const cfg = data.config.rating;
  const players = state.players || [];
  let sum = 0;
  let count = 0;
  const perPlayer = [];
  for (const p of players) {
    let total = 0;
    for (const s of STATS) {
      const v = Number(p.stats[s]) || 0;
      total += v;
      sum += v;
      count++;
    }
    perPlayer.push({ id: p.id, name: p.name, slot: p.slot, total });
  }
  const avgStat = count > 0 ? sum / count : 0;
  const learnedSkills = players.reduce((n, p) => n + (p.learnedSkillIds ? p.learnedSkillIds.length : 0), 0);
  const skillScore = cfg.skillValue * learnedSkills;
  const teamwork = Number(state.teamwork) || 0;
  const teamworkScore = cfg.teamworkWeight * teamwork;
  const score = Math.round((avgStat + skillScore + teamworkScore) * 10) / 10;

  const grade = gradeFromScore(score, cfg.thresholds);
  const losses = (state.record && state.record.losses) || 0;
  const capIdx = Math.min(losses, cfg.capByLosses.length - 1);
  const cap = cfg.capByLosses[capIdx];
  const cappedGrade = lowerGrade(grade, cap);

  return {
    score,
    grade,
    cappedGrade,
    breakdown: {
      avgStat: Math.round(avgStat * 10) / 10,
      learnedSkills,
      skillScore,
      teamwork,
      teamworkScore,
      losses,
      cap,
      goalMatches: state.record ? state.record.goalMatches.slice() : [],
      friendlies: state.record ? state.record.friendlies.slice() : [],
      perPlayer,
    },
  };
}
