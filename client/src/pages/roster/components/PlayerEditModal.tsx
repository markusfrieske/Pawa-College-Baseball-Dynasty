import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { Edit } from "lucide-react";
import type { Player } from "@shared/schema";
import { isPitcher, isCatcher, PITCHER_POSITIONS } from "@shared/positions";

interface PlayerEditModalProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Player>) => void;
  isSaving: boolean;
}

const positionsList: string[] = [...PITCHER_POSITIONS, "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"];
const eligibilityList = ["FR", "SO", "JR", "SR"];
const ratingLabels = {
  hitForAvg: "Contact", power: "Power", speed: "Speed", arm: "Arm", fielding: "Fielding",
  errorResistance: "Error resistance", clutch: "Clutch", vsLHP: "vs LHP", grit: "Grit",
  stealing: "Stealing", running: "Running", throwing: "Throwing", recovery: "Recovery",
  catcherAbility: "Catcher", velocity: "Velocity", control: "Control", stamina: "Stamina",
  wRISP: "W/RISP", vsLefty: "vs Lefty", poise: "Poise", heater: "Heater", agile: "Agile",
} as const;
type RatingField = keyof typeof ratingLabels;
const textFields = ["firstName", "lastName", "hometown", "homeState", "position", "eligibility"] as const;
type FormField = typeof textFields[number] | RatingField | "jerseyNumber" | "abilities";
type EditForm = Record<FormField, string>;

function initialForm(player: Player): EditForm {
  const fields = [...textFields, "jerseyNumber", ...Object.keys(ratingLabels)] as Exclude<FormField, "abilities">[];
  return {
    ...Object.fromEntries(fields.map(field => [field, player[field] == null ? "" : String(player[field])])),
    abilities: (player.abilities ?? []).join(", "),
  } as EditForm;
}

export function PlayerEditModal({ player, open, onClose, onSave, isSaving }: PlayerEditModalProps) {
  // Keep a stable edit baseline: a failed request or background refetch must not erase the draft.
  const [baseline] = useState(() => initialForm(player));
  const [formData, setFormData] = useState<EditForm>(() => initialForm(player));
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "attrs" | "common" | "abilities">("info");
  const isPlayerPitcher = isPitcher(formData.position);
  const setField = (field: FormField, value: string) => setFormData(current => ({ ...current, [field]: value }));

  const handleSubmit = () => {
    const updates: Record<string, string | number | string[]> = {};
    const issues: string[] = [];
    const limits = { firstName: 50, lastName: 50, hometown: 80, homeState: 30, position: 10 };
    for (const field of textFields) {
      if (formData[field] === baseline[field]) continue;
      const value = formData[field];
      if ((field === "firstName" || field === "lastName") && !value.trim()) {
        issues.push(`${field === "firstName" ? "First" : "Last"} name is required.`);
      } else if (field === "eligibility" && !eligibilityList.includes(value)) {
        issues.push("Choose FR, SO, JR, or SR for a new eligibility value.");
      } else if (field === "position" && !positionsList.includes(value)) {
        issues.push("Choose a supported position.");
      } else if (field !== "eligibility" && value.length > limits[field]) {
        issues.push(`${field} is too long (maximum ${limits[field]} characters).`);
      } else {
        updates[field] = value;
      }
    }
    for (const field of ["jerseyNumber", ...Object.keys(ratingLabels)] as ("jerseyNumber" | RatingField)[]) {
      // Empty legacy values stay empty unless the coach explicitly supplies a rating.
      if (formData[field] === baseline[field]) continue;
      const value = Number(formData[field]);
      const max = field === "jerseyNumber" ? 99 : 100;
      if (!formData[field].trim() || !Number.isInteger(value) || value < 0 || value > max) {
        issues.push(`${field === "jerseyNumber" ? "Jersey number" : ratingLabels[field]} must be a whole number from 0 to ${max}.`);
      } else if (baseline[field] === "" || value !== Number(baseline[field])) {
        updates[field] = value;
      }
    }
    if (formData.abilities !== baseline.abilities) {
      const abilities = formData.abilities.split(",").map(value => value.trim()).filter(Boolean);
      if (JSON.stringify(abilities) !== JSON.stringify(player.abilities ?? [])) updates.abilities = abilities;
    }
    if (issues.length) { setErrors(issues); return; }
    if (!Object.keys(updates).length) { setErrors(["No changes to save."]); return; }
    setErrors([]);
    onSave(updates as Partial<Player>);
  };

  const ratingInputs = (fields: RatingField[]) => (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(field => (
        <RetroInput key={field} label={ratingLabels[field]} type="number" min={0} max={100} step={1}
          value={formData[field]} placeholder="Not set" onChange={event => setField(field, event.target.value)}
          data-testid={`input-${field}`} />
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !isSaving) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gold text-sm flex items-center gap-2"><Edit className="w-4 h-4" /> Edit Player</DialogTitle>
          <DialogDescription>Only changed fields are saved. Overall and stars are calculated from player attributes.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-1 mb-4 border-b border-border pb-2" aria-label="Edit player sections">
          {(["info", "attrs", "common", "abilities"] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab}
              className={`min-h-11 min-w-0 px-1 py-1 text-xs rounded ${activeTab === tab ? "bg-gold text-background" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-${tab}`}>
              {tab === "info" ? "Info" : tab === "attrs" ? "Attributes" : tab === "common" ? "Common" : "Abilities"}
            </button>
          ))}
        </div>
        <fieldset disabled={isSaving} className="space-y-4 min-w-0">
          {activeTab === "info" && <>
            <div className="grid grid-cols-2 gap-3">
              <RetroInput label="First Name" value={formData.firstName} maxLength={50} onChange={e => setField("firstName", e.target.value)} data-testid="input-first-name" />
              <RetroInput label="Last Name" value={formData.lastName} maxLength={50} onChange={e => setField("lastName", e.target.value)} data-testid="input-last-name" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-2 text-xs text-muted-foreground">Position
                <select value={formData.position} onChange={e => setField("position", e.target.value)} className="w-full min-h-11 bg-card border border-border rounded px-2 text-sm" data-testid="select-position">
                  {!positionsList.includes(player.position) && <option value={player.position}>{player.position} (current)</option>}
                  {positionsList.map(position => <option key={position} value={position}>{position}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-xs text-muted-foreground">Year
                <select value={formData.eligibility} onChange={e => setField("eligibility", e.target.value)} className="w-full min-h-11 bg-card border border-border rounded px-2 text-sm" data-testid="select-eligibility">
                  {!eligibilityList.includes(player.eligibility) && <option value={player.eligibility}>{player.eligibility} (current)</option>}
                  {eligibilityList.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <RetroInput label="Jersey #" type="number" min={0} max={99} step={1} value={formData.jerseyNumber} onChange={e => setField("jerseyNumber", e.target.value)} data-testid="input-jersey" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RetroInput label="Hometown" maxLength={80} value={formData.hometown} onChange={e => setField("hometown", e.target.value)} data-testid="input-hometown" />
              <RetroInput label="State" maxLength={30} value={formData.homeState} onChange={e => setField("homeState", e.target.value)} data-testid="input-state" />
            </div>
            <div className="rounded border border-border p-3 text-xs text-muted-foreground space-y-2" data-testid="player-readonly-details">
              <p>Bats / throws: {player.batHand} / {player.throwHand} · Overall: {player.overall} · Stars: {player.starRating}</p>
              <p>Appearance: {[player.skinTone, player.hairColor, player.hairStyle, player.headwear].filter(Boolean).join(" · ") || "Not set"}</p>
              <p>Handedness and appearance are read-only in this editor.</p>
            </div>
          </>}
          {activeTab === "attrs" && <>
            <h4 className="text-gold text-xs border-b border-border pb-1">{isPlayerPitcher ? "Pitcher" : "Fielder"} attributes (0–100)</h4>
            {ratingInputs(isPlayerPitcher ? ["velocity", "control", "stamina"] : ["hitForAvg", "power", "speed", "arm", "fielding", "errorResistance"])}
          </>}
          {activeTab === "common" && <>
            <h4 className="text-gold text-xs border-b border-border pb-1">Common abilities (0–100)</h4>
            {ratingInputs(isPlayerPitcher ? ["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] : ["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery", ...(isCatcher(formData.position) ? ["catcherAbility" as const] : [])])}
          </>}
          {activeTab === "abilities" && <>
            <RetroInput label="Special ability IDs, separated by commas" value={formData.abilities} onChange={e => setField("abilities", e.target.value)} placeholder="explosive_fb, quick_hands" data-testid="input-abilities" />
            <p className="text-xs text-muted-foreground">Clear this field to remove all special abilities.</p>
          </>}
          {errors.length > 0 && <div role="alert" className="text-sm text-destructive" data-testid="player-edit-errors">{errors.map(message => <p key={message}>{message}</p>)}</div>}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <RetroButton variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</RetroButton>
            <RetroButton onClick={handleSubmit} disabled={isSaving} data-testid="button-save-player">{isSaving ? "Saving..." : "Save Changes"}</RetroButton>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
