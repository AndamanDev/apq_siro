'use strict';

// สถานะของคิว
const STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  PARKED: 'parked',
  SERVING: 'serving',
  DONE: 'done',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
};

// การเปลี่ยนสถานะที่อนุญาต (state machine)
const ALLOWED = {
  waiting: ['called', 'skipped', 'cancelled'],
  called: ['serving', 'parked', 'done', 'skipped', 'cancelled', 'called'], // called->called = เรียกซ้ำ
  parked: ['called', 'cancelled'],
  serving: ['done', 'parked'],
  done: [],
  skipped: ['waiting', 'called'],
  cancelled: [],
};

function canTransition(from, to) {
  return (ALLOWED[from] || []).includes(to);
}

module.exports = { STATUS, ALLOWED, canTransition };
