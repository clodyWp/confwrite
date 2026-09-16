/**
 * StateMachine — deterministic phase progression
 * 
 * Core loop:
 * 1. Load state
 * 2. Find current phase definition
 * 3. Validate prerequisites
 * 4. Check exit conditions → advance if met
 * 5. Execute phase logic
 * 6. Return action for the agent to execute
 */
import type { PhaseContext, PhaseResult } from './phases.js';
import { phases } from './phases.js';
import type { Phase, ProjectState } from '../state/schema.js';
import { ProjectStore } from '../state/store.js';

export interface StepResult {
  phase: Phase;
  phaseName: string;
  action: string;
  message: string;
  params?: Record<string, unknown>;
  advanced: boolean;
  previousPhase?: Phase;
}

export interface BlockedResult {
  phase: Phase;
  phaseName: string;
  blocked: true;
  error: string;
}

export type TickResult = StepResult | BlockedResult;

const STATUS_MAP: Record<string, ProjectState['status']> = {
  '0b': 'organizing',
  '1': 'init',
  '2': 'outlining',
  '3': 'organizing',
  '4a': 'writing',
  '4b': 'reviewing',
  '4c': 'reviewing',
  '4d': 'writing',
  '5': 'writing',
  '6': 'assembling',
  '7': 'assembling',
  '8': 'exporting',
  'done': 'done',
};

export class StateMachine {
  private store: ProjectStore;
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.store = new ProjectStore(projectDir);
  }

  async tick(): Promise<TickResult> {
    const state = this.store.load();
    if (!state) {
      return {
        phase: '0a',
        phaseName: '项目初始化',
        blocked: true,
        error: 'project-state.json 不存在。请先运行 /confwrite:init',
      };
    }

    return this.tickFrom(state);
  }

  private async tickFrom(state: ProjectState): Promise<TickResult> {
    const phase = state.currentPhase;
    const definition = phases.get(phase);

    if (!definition) {
      return {
        phase,
        phaseName: '未知',
        blocked: true,
        error: `未知 Phase: ${phase}`,
      };
    }

    const ctx: PhaseContext = { state, projectDir: this.projectDir };

    // Validate prerequisites
    const validation = definition.validate(ctx);
    if (!validation.ok) {
      return {
        phase,
        phaseName: definition.name,
        blocked: true,
        error: validation.error || '验证失败',
      };
    }

    // Check exit conditions — advance if met
    for (const exit of definition.exits) {
      if (exit.condition(ctx)) {
        const previousPhase = phase;
        this.advance(exit.target, state, previousPhase);

        const targetDef = phases.get(exit.target);
        return {
          phase: exit.target,
          phaseName: targetDef?.name || exit.target,
          action: 'phase_entered',
          message: `进入 ${targetDef?.name || exit.target}`,
          advanced: true,
          previousPhase,
        };
      }
    }

    // Execute current phase
    const result = await definition.execute(ctx);

    // Persist any state changes made during execute
    this.store.save(state);

    return {
      phase,
      phaseName: definition.name,
      action: result.action,
      message: result.message,
      params: result.params,
      advanced: false,
    };
  }

  private advance(target: Phase, state: ProjectState, fromPhase: Phase): void {
    state.currentPhase = target;

    if (STATUS_MAP[target]) {
      state.status = STATUS_MAP[target];
    }

    if (!state.executionLog) {
      state.executionLog = [];
    }
    state.executionLog.push({
      time: new Date().toISOString(),
      phase: target,
      action: `Phase ${fromPhase} → ${target}`,
    });

    this.store.save(state);
  }

  status(): { phase: Phase; name: string; status: string } | null {
    const state = this.store.load();
    if (!state) return null;

    const definition = phases.get(state.currentPhase);
    return {
      phase: state.currentPhase,
      name: definition?.name || '未知',
      status: state.status,
    };
  }

  forceAdvance(target: Phase): void {
    const state = this.store.load();
    if (!state) {
      throw new Error('State not found');
    }
    this.advance(target, state, state.currentPhase);
  }

  getStore(): ProjectStore {
    return this.store;
  }
}
