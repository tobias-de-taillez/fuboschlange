#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RouteBudget {
    pub max_expansions: u64,
}

impl RouteBudget {
    pub const fn new(max_expansions: u64) -> Self {
        Self { max_expansions }
    }
}

impl Default for RouteBudget {
    fn default() -> Self {
        Self::new(5_000_000)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoutingError {
    SolverLimitExceeded {
        attempted_expansion: u64,
        limit: u64,
    },
    NoRoute,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ExpansionCounter {
    limit: u64,
    count: u64,
}

impl ExpansionCounter {
    pub(crate) const fn new(budget: RouteBudget) -> Self {
        Self {
            limit: budget.max_expansions,
            count: 0,
        }
    }

    pub(crate) fn pop(&mut self) -> Result<(), RoutingError> {
        let attempted_expansion = self.count.saturating_add(1);
        if attempted_expansion > self.limit {
            return Err(RoutingError::SolverLimitExceeded {
                attempted_expansion,
                limit: self.limit,
            });
        }
        self.count = attempted_expansion;
        Ok(())
    }

    pub(crate) const fn count(self) -> u64 {
        self.count
    }
}
