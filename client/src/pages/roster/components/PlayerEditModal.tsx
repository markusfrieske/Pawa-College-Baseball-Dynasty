import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { Edit } from "lucide-react";
import type { Player } from "@shared/schema";
import { isPitcher, isCatcher } from "@shared/positions";

interface PlayerEditModalProps {
  player: Player;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Player>) => void;
  isSaving: boolean;
}

const positionsList = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const eligibilityList = ["FR", "SO", "JR", "SR"];
const skinToneOptions = ["light", "medium", "tan", "olive", "dark", "deep"];
const hairColorOptions = ["black", "brown", "blonde", "red", "gray", "white"];
const hairStyleOptions = ["short", "medium", "long", "fade", "buzz", "bald"];
const headwearOptions = ["cap", "helmet", "batting_helmet", "catchers_mask", "none"];

export function PlayerEditModal({ player, open, onClose, onSave, isSaving }: PlayerEditModalProps) {
  const [formData, setFormData] = useState({
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    eligibility: player.eligibility,
    jerseyNumber: player.jerseyNumber,
    hometown: player.hometown,
    homeState: player.homeState,
    batHand: player.batHand,
    throwHand: player.throwHand,
    skinTone: player.skinTone || "light",
    hairColor: player.hairColor || "brown",
    hairStyle: player.hairStyle || "short",
    headwear: player.headwear || "cap",
    overall: player.overall,
    starRating: player.starRating,
    hitForAvg: player.hitForAvg || 50,
    power: player.power || 50,
    speed: player.speed || 50,
    arm: player.arm || 50,
    fielding: player.fielding || 50,
    errorResistance: player.errorResistance || 50,
    clutch: player.clutch || 50,
    vsLHP: player.vsLHP || 50,
    grit: player.grit || 50,
    stealing: player.stealing || 50,
    running: player.running || 50,
    throwing: player.throwing || 50,
    recovery: player.recovery || 50,
    catcherAbility: player.catcherAbility || 50,
    velocity: player.velocity || 50,
    control: player.control || 50,
    stamina: player.stamina || 50,
    wRISP: player.wRISP || 50,
    vsLefty: player.vsLefty || 50,
    poise: player.poise || 50,
    heater: player.heater || 50,
    agile: player.agile || 50,
    abilities: player.abilities || [],
  });

  const [activeTab, setActiveTab] = useState<"info" | "attrs" | "common" | "abilities">("info");
  const isPlayerPitcher = isPitcher(formData.position);
  const isPlayerCatcher = isCatcher(formData.position);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gold text-sm flex items-center gap-2">
            <Edit className="w-4 h-4" />
            Edit Player
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-4 border-b border-border pb-2">
          {(["info", "attrs", "common", "abilities"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded ${
                activeTab === tab ? 'bg-gold text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === "info" ? "Info" : tab === "attrs" ? "Attributes" : tab === "common" ? "Common" : "Abilities"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "info" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">First Name</label>
                  <RetroInput
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Last Name</label>
                  <RetroInput
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Position</label>
                  <select
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-position"
                  >
                    {positionsList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Year</label>
                  <select
                    value={formData.eligibility}
                    onChange={(e) => setFormData({ ...formData, eligibility: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-eligibility"
                  >
                    {eligibilityList.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Jersey #</label>
                  <RetroInput
                    type="number"
                    min={0}
                    max={99}
                    value={formData.jerseyNumber}
                    onChange={(e) => setFormData({ ...formData, jerseyNumber: parseInt(e.target.value) || 0 })}
                    data-testid="input-jersey"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Hometown</label>
                  <RetroInput
                    value={formData.hometown}
                    onChange={(e) => setFormData({ ...formData, hometown: e.target.value })}
                    data-testid="input-hometown"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">State</label>
                  <RetroInput
                    value={formData.homeState}
                    onChange={(e) => setFormData({ ...formData, homeState: e.target.value })}
                    data-testid="input-state"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Bats</label>
                  <select
                    value={formData.batHand}
                    onChange={(e) => setFormData({ ...formData, batHand: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-bats"
                  >
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                    <option value="S">Switch</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Throws</label>
                  <select
                    value={formData.throwHand}
                    onChange={(e) => setFormData({ ...formData, throwHand: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm"
                    data-testid="select-throws"
                  >
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                  </select>
                </div>
              </div>
              <h4 className="text-gold text-xs border-b border-border pb-1">Appearance</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Skin Tone</label>
                  <select
                    value={formData.skinTone}
                    onChange={(e) => setFormData({ ...formData, skinTone: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-skin"
                  >
                    {skinToneOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Color</label>
                  <select
                    value={formData.hairColor}
                    onChange={(e) => setFormData({ ...formData, hairColor: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-hair-color"
                  >
                    {hairColorOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hair Style</label>
                  <select
                    value={formData.hairStyle}
                    onChange={(e) => setFormData({ ...formData, hairStyle: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-hair-style"
                  >
                    {hairStyleOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Headwear</label>
                  <select
                    value={formData.headwear}
                    onChange={(e) => setFormData({ ...formData, headwear: e.target.value })}
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-sm capitalize"
                    data-testid="select-headwear"
                  >
                    {headwearOptions.map(h => <option key={h} value={h}>{h.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Overall (1-999)</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={999}
                    value={formData.overall}
                    onChange={(e) => setFormData({ ...formData, overall: parseInt(e.target.value) || 1 })}
                    data-testid="input-overall"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Star Rating (1-5)</label>
                  <RetroInput
                    type="number"
                    min={1}
                    max={5}
                    value={formData.starRating}
                    onChange={(e) => setFormData({ ...formData, starRating: parseInt(e.target.value) || 1 })}
                    data-testid="input-star-rating"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "attrs" && (
            <>
              {isPlayerPitcher ? (
                <>
                  <h4 className="text-gold text-xs border-b border-border pb-1">Pitcher Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Velocity</label>
                      <RetroInput type="number" min={1} max={99} value={formData.velocity} onChange={(e) => setFormData({ ...formData, velocity: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Control</label>
                      <RetroInput type="number" min={1} max={99} value={formData.control} onChange={(e) => setFormData({ ...formData, control: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stamina</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stamina} onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="text-gold text-xs border-b border-border pb-1">Fielder Attributes (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Contact</label>
                      <RetroInput type="number" min={1} max={99} value={formData.hitForAvg} onChange={(e) => setFormData({ ...formData, hitForAvg: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Power</label>
                      <RetroInput type="number" min={1} max={99} value={formData.power} onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Speed</label>
                      <RetroInput type="number" min={1} max={99} value={formData.speed} onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Arm</label>
                      <RetroInput type="number" min={1} max={99} value={formData.arm} onChange={(e) => setFormData({ ...formData, arm: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fielding</label>
                      <RetroInput type="number" min={1} max={99} value={formData.fielding} onChange={(e) => setFormData({ ...formData, fielding: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Error Resist</label>
                      <RetroInput type="number" min={1} max={99} value={formData.errorResistance} onChange={(e) => setFormData({ ...formData, errorResistance: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "common" && (
            <>
              {isPlayerPitcher ? (
                <>
                  <h4 className="text-gold text-xs border-b border-border pb-1">Pitcher Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">W/RISP</label>
                      <RetroInput type="number" min={1} max={99} value={formData.wRISP} onChange={(e) => setFormData({ ...formData, wRISP: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">vs Lefty</label>
                      <RetroInput type="number" min={1} max={99} value={formData.vsLefty} onChange={(e) => setFormData({ ...formData, vsLefty: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Poise</label>
                      <RetroInput type="number" min={1} max={99} value={formData.poise} onChange={(e) => setFormData({ ...formData, poise: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Grit</label>
                      <RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Heater</label>
                      <RetroInput type="number" min={1} max={99} value={formData.heater} onChange={(e) => setFormData({ ...formData, heater: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Agile</label>
                      <RetroInput type="number" min={1} max={99} value={formData.agile} onChange={(e) => setFormData({ ...formData, agile: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Recovery</label>
                      <RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="text-gold text-xs border-b border-border pb-1">Fielder Common Abilities (1-99)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Clutch</label>
                      <RetroInput type="number" min={1} max={99} value={formData.clutch} onChange={(e) => setFormData({ ...formData, clutch: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">vs LHP</label>
                      <RetroInput type="number" min={1} max={99} value={formData.vsLHP} onChange={(e) => setFormData({ ...formData, vsLHP: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Grit</label>
                      <RetroInput type="number" min={1} max={99} value={formData.grit} onChange={(e) => setFormData({ ...formData, grit: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Stealing</label>
                      <RetroInput type="number" min={1} max={99} value={formData.stealing} onChange={(e) => setFormData({ ...formData, stealing: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Running</label>
                      <RetroInput type="number" min={1} max={99} value={formData.running} onChange={(e) => setFormData({ ...formData, running: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Throwing</label>
                      <RetroInput type="number" min={1} max={99} value={formData.throwing} onChange={(e) => setFormData({ ...formData, throwing: parseInt(e.target.value) || 50 })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Recovery</label>
                      <RetroInput type="number" min={1} max={99} value={formData.recovery} onChange={(e) => setFormData({ ...formData, recovery: parseInt(e.target.value) || 50 })} />
                    </div>
                    {isPlayerCatcher && (
                      <div>
                        <label className="text-xs text-muted-foreground">Catcher</label>
                        <RetroInput type="number" min={1} max={99} value={formData.catcherAbility} onChange={(e) => setFormData({ ...formData, catcherAbility: parseInt(e.target.value) || 50 })} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "abilities" && (
            <>
              <h4 className="text-gold text-xs border-b border-border pb-1">Special Abilities</h4>
              <div className="text-xs text-muted-foreground mb-2">
                Enter ability IDs separated by commas (e.g., explosive_fb, quick_hands)
              </div>
              <RetroInput
                value={(formData.abilities || []).join(", ")}
                onChange={(e) => setFormData({
                  ...formData,
                  abilities: e.target.value.split(",").map(a => a.trim()).filter(a => a)
                })}
                placeholder="explosive_fb, monster_stuff"
                data-testid="input-abilities"
              />
              <div className="text-xs text-muted-foreground mt-2">
                Current: {(formData.abilities || []).length} abilities
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <RetroButton variant="outline" onClick={onClose} data-testid="button-cancel-edit">
              Cancel
            </RetroButton>
            <RetroButton onClick={handleSubmit} disabled={isSaving} data-testid="button-save-player">
              {isSaving ? "Saving..." : "Save Changes"}
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
