/** Shared, deterministic cel portrait kit. Appearance comes only from stored traits;
 * changing team colors changes clothing and headwear, never the player's face. */
export interface CelCharacterProps {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  eyeStyle?: string;
  eyebrowStyle?: string;
  mouthStyle?: string;
  eyeBlack?: boolean;
  headwear?: string;
  jerseyColor?: string;
  isRecruit?: boolean;
  coach?: boolean;
}

const skinPalette: Record<string, [string, string, string]> = {
  light: ["#f4c6a7", "#d69576", "#ffdfc5"],
  medium: ["#d8a17a", "#b57855", "#f0bc91"],
  tan: ["#c48d61", "#9a6146", "#e0ae7d"],
  olive: ["#bb976d", "#92714e", "#d9b68b"],
  dark: ["#925d3d", "#69432f", "#b67d56"],
  deep: ["#614233", "#442c25", "#875c44"],
};
const hairPalette: Record<string, [string, string]> = {
  black: ["#242829", "#424849"], brown: ["#51392d", "#79513b"],
  blonde: ["#be914b", "#e4bd75"], red: ["#884730", "#b66b46"],
  gray: ["#737875", "#a0aaa3"], white: ["#c9ccc3", "#eeeade"],
};
const hairShapes: Record<string, string> = {
  short: "M72 94 70 69Q66 48 88 42L90 34 101 38Q124 22 148 40L160 38 158 46Q175 57 169 93L158 78 153 64Q130 75 102 65L83 75 80 96Z",
  medium: "M70 107Q57 73 68 52L61 51 81 39Q107 18 148 33L158 28 157 40Q181 50 174 79L166 110 156 86 150 62Q138 77 121 73L129 59Q108 81 85 76L81 108Z",
  long: "M71 118Q51 72 66 45 82 24 123 26 170 27 177 62L172 125 162 168 151 169 160 88 151 57Q116 81 82 72Z",
  fade: "M75 91 72 62Q78 37 108 37L135 36Q162 41 167 61L163 94 155 76 152 60Q121 70 87 62L83 79Z",
  buzz: "M76 87 73 68Q74 40 120 39 163 40 167 68L163 87 158 67Q124 51 82 67Z",
  curly: "M71 98Q57 94 65 81 54 70 66 59 60 45 77 43 76 28 94 32 104 20 119 29 135 18 145 33 163 27 169 44 183 45 176 61 186 73 174 86L165 104 157 78Q146 83 139 69 128 79 118 68 106 80 98 67 88 77 79 75Z",
  mullet: "M73 94 69 62Q78 32 116 36L137 30 140 38Q166 39 168 63L168 96 160 86 153 63Q118 77 87 65L81 94Z",
};

export function CelCharacter({
  skinTone = "light", hairColor = "brown", hairStyle = "short", facialHair = "none",
  eyeStyle = "standard", eyebrowStyle = "flat", mouthStyle = "neutral", eyeBlack = false,
  headwear = "none", jerseyColor, isRecruit = false, coach = false,
}: CelCharacterProps) {
  const [skin, shade, light] = skinPalette[skinTone] || skinPalette.light;
  const [hair, hairLight] = hairPalette[hairColor] || hairPalette.brown;
  const jersey = isRecruit ? "#707983" : jerseyColor || "#254c3b";
  const style = hairStyle === "buzzcut" ? "buzz" : hairStyle;
  const ink = "#29322d";
  const helmet = headwear === "helmet" || headwear === "batting_helmet";
  const cap = headwear === "cap";
  const eyeHeight = eyeStyle === "narrow" ? 3.5 : eyeStyle === "wide" ? 8 : 5.8;
  const brows: Record<string, [string, string]> = {
    flat: ["M91 101 107 100", "M132 100 149 101"],
    arched: ["M90 102Q99 95 108 100", "M132 100Q142 95 151 102"],
    thick: ["M90 100 108 99", "M132 99 151 100"],
    furrowed: ["M91 98 108 103", "M132 103 149 98"],
  };
  const mouth = mouthStyle === "smile" ? "M105 148Q120 164 136 147Q121 152 105 148Z"
    : mouthStyle === "smirk" ? "M106 153Q123 157 137 146" : "M108 152Q120 155 133 151";
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden="true" focusable="false" data-art-style="cel" data-hair-style={style}>
      <rect width="240" height="240" fill="#dcd8c5" />
      <path d="M0 160 240 48V0H0Z" fill="#eee6d0" />
      <circle cx="127" cy="110" r="86" fill="#bec7ac" />
      <path d="M0 215 240 174V240H0Z" fill="#b2bba0" />
      {/* Back hair stays behind the neck, including when a cap is worn. */}
      {(style === "long" || style === "mullet") && <path d={style === "long"
        ? "M73 66Q58 88 61 140L54 182 81 190 103 163 145 163 163 191 185 179 174 137 168 64Z"
        : "M74 80 67 146 58 168 72 164 70 178 91 171 104 150 148 151 160 174 177 174 171 161 183 164 170 130 168 78Z"}
        fill={hair} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />}
      <path d="M101 162 101 181 85 188 89 216 151 216 156 188 138 181 138 161Z" fill={skin} stroke={ink} strokeWidth="2.5" />
      <path d="M103 166 137 166 137 180Q120 190 102 179Z" fill={shade} />
      {/* Tailored baseball jersey / coach polo. */}
      <path d="M85 183Q63 187 40 199L24 240H216L201 200Q180 188 156 183L139 188Q121 201 102 189Z" fill={jersey} stroke={ink} strokeWidth="3" />
      <path d="M43 201 57 218 53 240H26ZM195 201 182 220 187 240H214Z" fill="#10231c" opacity=".25" />
      <path d={coach ? "M85 183 102 184 119 201 99 208ZM139 184 156 183 143 208 121 201Z" : "M87 183 103 186Q120 204 139 186L153 183 141 203 120 213 99 201Z"}
        fill={coach ? "#263c32" : "#eee8d5"} stroke={ink} strokeWidth="2" />
      <path d="M120 210V240" stroke="#f4eedb" strokeWidth="2" opacity=".75" />
      {!coach && <><circle cx="125" cy="222" r="1.6" fill="#eee8d5" /><circle cx="125" cy="234" r="1.6" fill="#eee8d5" /><path d="M149 217 163 214 164 226 156 231 148 225Z" fill="#eee8d5" opacity=".85" /></>}
      {coach && <path d="M146 215H165M146 218H159" stroke="#eee8d5" strokeWidth="2" strokeLinecap="round" />}
      {/* Ears and face silhouette. */}
      <path d="M79 105Q63 97 66 119 69 135 83 133M161 105Q177 97 174 119 171 135 157 133" fill={skin} stroke={ink} strokeWidth="2.5" />
      <path d="M71 111 77 119 72 124M169 111 163 119 168 124" fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" />
      <path d="M78 79Q77 43 120 41 163 43 163 79L160 134Q157 158 137 173 122 182 108 175 83 161 79 137Z" fill={skin} stroke={ink} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M146 60Q161 74 159 100L151 126 153 139Q149 156 133 168L109 168 121 178Q146 173 158 149L163 93Q165 65 146 60Z" fill={shade} />
      <path d="M86 83Q87 60 104 57L109 70 93 91Z" fill={light} opacity=".8" />
      <path d="M88 134 104 138 99 143 88 141Z" fill={light} opacity=".65" />
      {/* Hair is a silhouette with a single cel highlight, never pixel blocks. */}
      {style !== "bald" && !cap && !helmet && <g stroke={ink} strokeWidth="2.5" strokeLinejoin="round">
        <path d={hairShapes[style] || hairShapes.short} fill={hair} />
        {style === "curly" ? <path d="M78 51Q87 40 96 48M102 41Q112 31 119 42M129 40Q142 32 150 45M151 57Q162 48 167 60" fill="none" stroke={hairLight} strokeWidth="4" strokeLinecap="round" />
          : <path d={style === "buzz" ? "M86 57Q113 42 151 57" : "M82 55Q111 36 143 45L115 49 99 59Z"} fill={hairLight} stroke="none" opacity=".65" />}
        {style === "fade" && <path d="M77 73 78 91M162 72 161 92" stroke={hairLight} strokeWidth="4" opacity=".65" />}
      </g>}
      {/* Expression traits retain the legacy identity selection in the caller. */}
      <g fill="none" stroke={hair} strokeWidth={eyebrowStyle === "thick" ? 5.5 : 3.5} strokeLinecap="round">
        {(brows[eyebrowStyle] || brows.flat).map((d, i) => <path d={d} key={i} />)}
      </g>
      {[99, 141].map(x => <g key={x}>
        <path d={`M${x-10} 115Q${x} ${115-eyeHeight*1.9} ${x+10} 115Q${x} ${115+eyeHeight*1.5} ${x-10} 115Z`} fill="#f9f6e9" stroke={ink} strokeWidth="1.8" />
        <ellipse cx={x+1} cy="115" rx={eyeStyle === "wide" ? 4.5 : 3.8} ry={eyeHeight} fill="#353d32" />
        <ellipse cx={x+1} cy="115" rx="2.3" ry={Math.min(eyeHeight, 4.5)} fill="#16211c" />
        <circle cx={x-.3} cy={114-Math.min(eyeHeight, 4)*.35} r="1.25" fill="#fffdf0" />
        {eyeStyle === "heavy" && <path d={`M${x-10} 112Q${x} 108 ${x+10} 112`} fill="none" stroke={shade} strokeWidth="3.5" />}
        {eyeBlack && <path d={`M${x-9} 127  ${x+8} 127  ${x+7} 132 ${x-8} 132Z`} fill="#28322d" />}
      </g>)}
      <path d="M120 117 116 136 124 138 129 135" fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {facialHair === "stubble" && <path d="M87 142Q94 169 119 174 144 168 152 143L140 150 136 163 107 163 99 150Z" fill={hair} opacity=".28" />}
      {facialHair === "beard" && <path d="M82 127 91 144 107 146 119 142 136 146 152 139 159 128 156 151Q145 176 120 178 94 172 84 150Z" fill={hair} stroke={ink} strokeWidth="1.5" />}
      {facialHair === "goatee" && <path d="M109 145Q120 140 131 145L135 161 127 172H114L106 161Z" fill={hair} />}
      <path d={mouth} fill={mouthStyle === "smile" ? "#fff5df" : "none"} stroke={facialHair === "beard" || facialHair === "goatee" || skinTone === "deep" ? light : "#643f35"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {facialHair === "mustache" && <path d="M105 141Q115 136 121 141 130 136 137 144L139 148 126 146 120 145 111 148 102 147Z" fill={hair} />}
      {coach && <g fill="none" stroke={shade} strokeWidth="1.5" strokeLinecap="round"><path d="M87 119 83 123M152 119 157 123M97 141 94 149M142 140 145 149M104 86Q120 82 138 86" /></g>}
      {/* Headwear is real kit state; no team logo is invented. */}
      {(cap || helmet) && <g stroke={ink} strokeWidth="2.5" strokeLinejoin="round">
        <path d="M69 83Q69 33 119 32 168 31 172 78L163 91 76 90Z" fill={jersey} />
        <path d="M119 35Q137 50 139 78M89 43Q78 60 79 80" fill="none" stroke="#f0e6cd" opacity=".4" strokeWidth="2" />
        <path d="M71 80Q108 69 143 79L181 93Q187 97 179 101L150 100Q121 88 74 92Z" fill={jersey} />
        <path d="M78 90Q116 82 150 97L179 99" fill="none" stroke="#10231c" opacity=".55" strokeWidth="4" />
        {helmet && <path d="M162 84 174 87 173 129 158 140 153 126 160 109Z" fill={jersey} />}
        {helmet && <ellipse cx="165" cy="117" rx="3" ry="6" fill="#13271e" stroke="none" />}
        <path d="M114 46 124 46 126 62 118 67 111 61Z" fill="#eee8d5" stroke="none" opacity=".85" />
      </g>}
    </svg>
  );
}
