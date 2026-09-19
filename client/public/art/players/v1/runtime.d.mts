export const DEFAULT_TEAM_COLOR: string;
export function normalizeTeamColor(value: unknown): string;
export function isFabricKey(r:number,g:number,b:number):boolean;
export function recolorFabric(data:Uint8ClampedArray,color:string):Uint8ClampedArray;
export function renderPortrait(canvas:HTMLCanvasElement,options:{id:string;teamColor?:string;size?:number;baseUrl?:string}):Promise<boolean>;
export function cancelPortrait(canvas:HTMLCanvasElement):void;
