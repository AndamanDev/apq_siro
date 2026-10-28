'use strict';
const { pad2 } = require('./slotUtils');

// ประกอบเลขคิว: roomCode + slotCode + 2-digit running  => L6 + 08 + 01 = L60801
function buildQueueNumber(roomCode, slotCode, seq) {
  return `${roomCode}${slotCode}${pad2(seq)}`;
}

// แตกเลขคิวเป็นชุดคีย์เสียง (สำหรับเล่นเสียงทีละตัว)
// 'L60801' -> ['L','6','0','8','0','1']
function spellChars(queueNumber) {
  return String(queueNumber).split('');
}

module.exports = { buildQueueNumber, spellChars };
