import { calculateOVR } from "../shared/abilities";

const players: any[] = [
  { name: "Mason Edwards", position: "P", velocity: 66, control: 69, stamina: 69, stuff: 71, arm: 65, fielding: 41, heater: 65, poise: 65, recovery: 57, wRISP: 65, vsLefty: 69, abilities: ["Star of Victory", "Inside Pitch", "Intimidator", "Heavy Ball", "Winner's Luck"] },
  { name: "Jackson Flora", position: "P", velocity: 82, control: 77, stamina: 76, stuff: 82, arm: 72, fielding: 43, heater: 80, poise: 77, recovery: 69, wRISP: 76, vsLefty: 79, abilities: ["Star of Victory", "Intimidator", "Heavy Ball"] },
  { name: "Dax Whitney", position: "P", velocity: 67, control: 66, stamina: 69, stuff: 72, arm: 70, fielding: 41, heater: 70, poise: 67, recovery: 57, wRISP: 62, vsLefty: 64, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] },
  { name: "Dylan Volantis", position: "P", velocity: 69, control: 65, stamina: 52, stuff: 72, arm: 72, fielding: 46, heater: 68, poise: 68, recovery: 52, wRISP: 68, vsLefty: 67, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Heavy Ball", "Winner's Luck", "Natural Shuuto"] },
  { name: "Liam Peterson", position: "P", velocity: 69, control: 57, stamina: 63, stuff: 65, arm: 68, fielding: 41, heater: 71, poise: 65, recovery: 57, wRISP: 57, vsLefty: 62, abilities: ["Strong Starter", "Explosive Fastball", "Intimidator", "Tunneling", "Heavy Ball", "Winner's Luck"] },
  { name: "Aidan King", position: "P", velocity: 64, control: 69, stamina: 65, stuff: 70, arm: 65, fielding: 41, heater: 65, poise: 65, recovery: 57, wRISP: 65, vsLefty: 65, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Heavy Ball", "Winner's Luck"] },
  { name: "Tyler Fay", position: "P", velocity: 69, control: 65, stamina: 69, stuff: 71, arm: 65, fielding: 41, heater: 69, poise: 65, recovery: 57, wRISP: 64, vsLefty: 65, abilities: ["Star of Victory", "Intimidator", "Strong Starter", "Heavy Ball", "Fireman", "Wild Fastball"] },
  { name: "Jake Marciano", position: "P", velocity: 62, control: 61, stamina: 56, stuff: 61, arm: 62, fielding: 38, heater: 64, poise: 58, recovery: 48, wRISP: 53, vsLefty: 56, abilities: ["Strong Starter", "Inside Pitch", "Full Throttle"] },
  { name: "Jason DeCaro", position: "P", velocity: 66, control: 65, stamina: 67, stuff: 65, arm: 65, fielding: 46, heater: 62, poise: 67, recovery: 62, wRISP: 63, vsLefty: 63, abilities: ["Star of Victory", "Inside Pitch", "Strong Starter", "Intimidator"] },
  { name: "Caden Glauber", position: "P", velocity: 65, control: 57, stamina: 39, stuff: 60, arm: 61, fielding: 36, heater: 55, poise: 57, recovery: 47, wRISP: 55, vsLefty: 55, abilities: ["Strong Starter", "Doctor K", "Constant Speed", "Groundball Pitcher", "Strong Finisher"] },
];

// Calibration tests
console.log("=== Calibration ===");
const t1 = calculateOVR({ position: "P", velocity: 90, control: 88, stamina: 88, stuff: 90, arm: 85, fielding: 55, heater: 90, poise: 85, recovery: 80, wRISP: 85, vsLefty: 88, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`90/88/88/90 + 5 abilities: OVR = ${t1}`);

const t2 = calculateOVR({ position: "P", velocity: 95, control: 92, stamina: 91, stuff: 95, arm: 90, fielding: 60, heater: 95, poise: 90, recovery: 85, wRISP: 90, vsLefty: 92, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`95/92/91/95 + 5 abilities: OVR = ${t2}`);

const t3 = calculateOVR({ position: "P", velocity: 99, control: 97, stamina: 95, stuff: 99, arm: 95, fielding: 65, heater: 99, poise: 95, recovery: 92, wRISP: 95, vsLefty: 96, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`99/97/95/99 + 5 abilities: OVR = ${t3}`);

console.log("\n=== Current OVR Values ===");
for (const p of players) {
  const ovr = calculateOVR(p);
  console.log(`${p.name}: OVR = ${ovr}`);
}

// What attrs needed for ~560 OVR?
// Formula: pitchCore*0.85 + pitchField*0.20 + pitchCommon*0.25 + specialBonus = 560
// With 1 gold + 4 blue = 30 bonus: need 530 from attrs
// pitchCore(4attrs)*0.85 + pitchField(2attrs)*0.20 + pitchCommon(5attrs)*0.25 = 530
// So at v=92 c=88 s=88 st=92: core=360*0.85=306; arm=88 f=55: field=143*0.20=28.6; h=92 po=87 rc=82 wr=88 vl=88: common=437*0.25=109.25 → 306+29+109+30=474

// Let me compute what we actually need for 550:
// 550 - 30 = 520 needed from attrs
// if core*0.85 = ~370 → core=435 → v+c+s+st=435 (avg 108 each - impossible if cap is 99!)
// So max OVR is indeed limited

// What is max possible OVR for pitcher?
const maxOvr = calculateOVR({ position: "P", velocity: 99, control: 99, stamina: 99, stuff: 99, arm: 99, fielding: 99, heater: 99, poise: 99, recovery: 99, wRISP: 99, vsLefty: 99, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`\nMax possible OVR (all 99): ${maxOvr}`);

// At what attrs do we hit 500?
const t500 = calculateOVR({ position: "P", velocity: 86, control: 84, stamina: 83, stuff: 87, arm: 84, fielding: 55, heater: 87, poise: 82, recovery: 78, wRISP: 82, vsLefty: 84, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`86/84/83/87 attrs: OVR = ${t500}`);

const t520 = calculateOVR({ position: "P", velocity: 90, control: 88, stamina: 86, stuff: 91, arm: 87, fielding: 57, heater: 90, poise: 85, recovery: 81, wRISP: 85, vsLefty: 87, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`90/88/86/91 attrs: OVR = ${t520}`);

const t550 = calculateOVR({ position: "P", velocity: 95, control: 93, stamina: 90, stuff: 96, arm: 92, fielding: 62, heater: 95, poise: 90, recovery: 85, wRISP: 90, vsLefty: 92, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`95/93/90/96 attrs: OVR = ${t550}`);

const t580 = calculateOVR({ position: "P", velocity: 98, control: 96, stamina: 94, stuff: 99, arm: 96, fielding: 66, heater: 98, poise: 94, recovery: 90, wRISP: 94, vsLefty: 96, abilities: ["Star of Victory", "Intimidator", "Sharpness", "Decisive", "Winner's Luck"] });
console.log(`98/96/94/99 attrs: OVR = ${t580}`);
