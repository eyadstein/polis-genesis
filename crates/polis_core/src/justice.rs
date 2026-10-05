//! Crime, policing, courts, and prison.
//!
//! These are the rules. The world decides who is desperate enough to steal
//! and applies the sentences. Crime here has causes: hunger, poverty, a
//! hot temper, and nobody watching. Violence is a counted event with a
//! consequence, never a graphic scene.

use crate::agent::AgentId;
use crate::economy::Coins;
use crate::rng::Rng;
use std::collections::VecDeque;

pub const MAX_ATTEMPTS: u8 = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CrimeKind {
    Theft,
    Assault,
}

#[derive(Clone, Debug)]
pub struct Crime {
    pub id: u32,
    pub tick: u64,
    pub kind: CrimeKind,
    pub accused: AgentId,
    pub victim: Option<AgentId>,
    pub loss: Coins,
    /// How easy the crime is to prove, from 0 to 1.
    pub evidence: f32,
    pub attempts: u8,
}

#[derive(Clone, Debug)]
pub struct Case {
    pub crime: Crime,
    pub defended: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sentence {
    pub fine: Coins,
    pub prison_ticks: u64,
}

#[derive(Clone, Debug, Default)]
pub struct Justice {
    /// Crimes the police have not solved yet.
    pub open: VecDeque<Crime>,
    /// Cases with someone charged, waiting for a judge.
    pub docket: VecDeque<Case>,
    /// Cases a judge has taken up this tick, with the judge's skill.
    pub hearings: Vec<(Case, f32)>,
    pub crimes: u64,
    pub convictions: u64,
    pub acquittals: u64,
    next_id: u32,
}

impl Justice {
    pub fn report(
        &mut self,
        tick: u64,
        kind: CrimeKind,
        accused: AgentId,
        victim: Option<AgentId>,
        loss: Coins,
        evidence: f32,
    ) {
        let id = self.next_id;
        self.next_id += 1;
        self.crimes += 1;
        self.open.push_back(Crime {
            id,
            tick,
            kind,
            accused,
            victim,
            loss,
            evidence: evidence.clamp(0.0, 1.0),
            attempts: 0,
        });
    }

    /// An officer works the oldest open crime. Returns true if someone was
    /// charged. Cases that stay unsolved for too long go cold.
    pub fn investigate(&mut self, skill: f32, rng: &mut Rng) -> bool {
        let Some(mut crime) = self.open.pop_front() else {
            return false;
        };
        let chance = (0.25 + 0.5 * skill + 0.3 * crime.evidence).clamp(0.05, 0.95);
        if rng.chance(chance) {
            self.docket.push_back(Case {
                crime,
                defended: false,
            });
            return true;
        }
        crime.attempts += 1;
        if crime.attempts < MAX_ATTEMPTS {
            self.open.push_back(crime);
        }
        false
    }

    pub fn has_undefended(&self) -> bool {
        self.docket.iter().any(|case| !case.defended)
    }

    /// A lawyer takes up the defence of the first case without one.
    pub fn defend(&mut self) -> bool {
        match self.docket.iter_mut().find(|case| !case.defended) {
            Some(case) => {
                case.defended = true;
                true
            }
            None => false,
        }
    }

    /// A judge takes the next case on the docket.
    pub fn take_for_hearing(&mut self, skill: f32) -> bool {
        match self.docket.pop_front() {
            Some(case) => {
                self.hearings.push((case, skill));
                true
            }
            None => false,
        }
    }
}

/// How likely a trial is to end in a conviction. Strong evidence raises it,
/// a defence lawyer lowers it.
pub fn conviction_chance(evidence: f32, defended: bool, judge_skill: f32) -> f32 {
    let defence = if defended { 0.2 } else { 0.0 };
    (0.2 + 0.7 * evidence + 0.1 * judge_skill - defence).clamp(0.05, 0.95)
}

/// What a convicted person owes. People who cannot pay the fine in full
/// are jailed for longer, and repeat offenders for longer still.
pub fn sentence_for(kind: CrimeKind, loss: Coins, accused_money: Coins, record: u32) -> Sentence {
    let repeat = 100 * u64::from(record);
    match kind {
        CrimeKind::Theft => {
            let owed = 3 * loss + 10;
            let fine = owed.min(accused_money);
            let prison_ticks = if fine >= owed { repeat } else { 300 + repeat };
            Sentence { fine, prison_ticks }
        }
        CrimeKind::Assault => Sentence {
            fine: 0,
            prison_ticks: 400 + repeat,
        },
    }
}

/// How much visible policing lowers crime, up to one half.
pub fn deterrence(officers: usize, adults: usize) -> f32 {
    if adults == 0 {
        return 0.0;
    }
    (officers as f32 / (adults as f32 * 0.03)).min(1.0) * 0.5
}

/// The chance per tick that a hungry, broke person steals. Bold and
/// careless people are likelier, careful ones less so, and police lower it.
pub fn theft_urge(
    hunger: f32,
    can_afford_food: bool,
    boldness: f32,
    carefulness: f32,
    deterrence: f32,
) -> f32 {
    if hunger >= 0.5 || can_afford_food {
        return 0.0;
    }
    let base = (0.02 + 0.06 * boldness - 0.03 * carefulness).max(0.003);
    base * (1.0 - deterrence)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crime(justice: &mut Justice, evidence: f32) {
        justice.report(0, CrimeKind::Theft, 1, None, 4, evidence);
    }

    #[test]
    fn crimes_are_counted_and_queued_in_order() {
        let mut justice = Justice::default();
        crime(&mut justice, 0.5);
        justice.report(1, CrimeKind::Assault, 2, Some(3), 0, 0.6);
        assert_eq!(justice.crimes, 2);
        assert_eq!(justice.open.len(), 2);
        assert_eq!(justice.open[0].id, 0);
        assert_eq!(justice.open[1].kind, CrimeKind::Assault);
    }

    #[test]
    fn solved_cases_go_to_the_docket() {
        let mut justice = Justice::default();
        crime(&mut justice, 1.0);
        let mut rng = Rng::new(1);
        let mut solved = false;
        for _ in 0..50 {
            if justice.investigate(1.0, &mut rng) {
                solved = true;
                break;
            }
            crime(&mut justice, 1.0);
        }
        assert!(solved);
        assert_eq!(justice.docket.len(), 1);
        assert!(!justice.docket[0].defended);
    }

    #[test]
    fn unsolved_cases_eventually_go_cold() {
        let mut justice = Justice::default();
        crime(&mut justice, 0.0);
        let mut rng = Rng::new(3);
        for _ in 0..2000 {
            justice.investigate(0.0, &mut rng);
            if justice.open.is_empty() {
                break;
            }
        }
        assert!(justice.open.is_empty());
        assert!(justice.docket.len() <= 1);
    }

    #[test]
    fn nothing_to_investigate_is_not_a_success() {
        let mut justice = Justice::default();
        assert!(!justice.investigate(1.0, &mut Rng::new(1)));
    }

    #[test]
    fn skilled_officers_solve_more() {
        let solved = |skill: f32| {
            let mut count = 0;
            let mut rng = Rng::new(7);
            for _ in 0..2000 {
                let mut justice = Justice::default();
                crime(&mut justice, 0.4);
                if justice.investigate(skill, &mut rng) {
                    count += 1;
                }
            }
            count
        };
        assert!(solved(1.0) > solved(0.0));
    }

    #[test]
    fn lawyers_defend_each_case_once_and_judges_take_them_in_order() {
        let mut justice = Justice::default();
        for id in 0..2 {
            justice.docket.push_back(Case {
                crime: Crime {
                    id,
                    tick: 0,
                    kind: CrimeKind::Theft,
                    accused: id,
                    victim: None,
                    loss: 4,
                    evidence: 0.5,
                    attempts: 0,
                },
                defended: false,
            });
        }
        assert!(justice.has_undefended());
        assert!(justice.defend());
        assert!(justice.defend());
        assert!(!justice.defend());
        assert!(!justice.has_undefended());
        assert!(justice.take_for_hearing(0.5));
        assert_eq!(justice.hearings[0].0.crime.id, 0);
        assert_eq!(justice.docket.len(), 1);
        assert!(justice.take_for_hearing(0.5));
        assert!(!justice.take_for_hearing(0.5));
    }

    #[test]
    fn evidence_convicts_and_a_defence_helps() {
        assert!(conviction_chance(0.9, false, 0.5) > conviction_chance(0.2, false, 0.5));
        assert!(conviction_chance(0.5, true, 0.5) < conviction_chance(0.5, false, 0.5));
        for evidence in [0.0, 0.5, 1.0] {
            for defended in [false, true] {
                let p = conviction_chance(evidence, defended, 1.0);
                assert!((0.05..=0.95).contains(&p));
            }
        }
    }

    #[test]
    fn people_who_cannot_pay_serve_longer() {
        let rich = sentence_for(CrimeKind::Theft, 4, 500, 0);
        let poor = sentence_for(CrimeKind::Theft, 4, 3, 0);
        assert_eq!(rich.fine, 22);
        assert_eq!(rich.prison_ticks, 0);
        assert_eq!(poor.fine, 3);
        assert!(poor.prison_ticks > rich.prison_ticks);
    }

    #[test]
    fn fines_never_exceed_what_a_person_has() {
        for money in [0, 1, 5, 21, 22, 1000] {
            assert!(sentence_for(CrimeKind::Theft, 4, money, 0).fine <= money);
        }
        assert_eq!(sentence_for(CrimeKind::Assault, 0, 50, 0).fine, 0);
    }

    #[test]
    fn repeat_offenders_serve_longer() {
        let first = sentence_for(CrimeKind::Assault, 0, 0, 0);
        let third = sentence_for(CrimeKind::Assault, 0, 0, 2);
        assert!(third.prison_ticks > first.prison_ticks);
    }

    #[test]
    fn police_lower_the_urge_to_steal() {
        assert_eq!(deterrence(0, 100), 0.0);
        assert_eq!(deterrence(0, 0), 0.0);
        assert!(deterrence(2, 100) > 0.0);
        assert_eq!(deterrence(50, 100), 0.5);
        let calm = theft_urge(0.1, false, 0.5, 0.5, 0.5);
        let lawless = theft_urge(0.1, false, 0.5, 0.5, 0.0);
        assert!(calm < lawless);
    }

    #[test]
    fn only_the_hungry_and_broke_steal() {
        assert_eq!(theft_urge(0.9, false, 1.0, 0.0, 0.0), 0.0);
        assert_eq!(theft_urge(0.1, true, 1.0, 0.0, 0.0), 0.0);
        assert!(theft_urge(0.1, false, 0.0, 1.0, 0.0) > 0.0);
        assert!(theft_urge(0.1, false, 1.0, 0.0, 0.0) > theft_urge(0.1, false, 0.0, 1.0, 0.0));
    }
}
