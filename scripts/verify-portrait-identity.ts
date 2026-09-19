import assert from 'node:assert/strict';
import {portraitIdSchema,savedPortraitId} from '../shared/portrait-identity';
import {convertRecruitToPlayer,convertWalkonToPlayer} from '../server/services/signingService';
import {validateAndNormalizeRecruitingClass} from '../server/lib/validateRecruitingClass';
for(const id of [undefined,null,'c9-face-01','c9-face-30'])assert(portraitIdSchema.safeParse(id).success);
for(const id of ['c9-face-00','c9-face-31','../x','',3])assert(!portraitIdSchema.safeParse(id).success);
assert.equal(savedPortraitId({}),undefined);assert.equal(savedPortraitId({portraitId:null}),null);
assert.equal(savedPortraitId({appearance:{portraitId:'c9-face-02'}}),'c9-face-02');
assert.throws(()=>savedPortraitId({portraitId:'c9-face-01',appearance:{portraitId:'c9-face-02'}}));
assert.throws(()=>savedPortraitId({portraitId:'wrong'}));
const source:any={id:'stable-person',firstName:'Test',lastName:'Person',position:'1B',recruitType:'HS',homeState:'IA',hometown:'Test',abilities:[],tools:[],overall:400,starRating:3,portraitId:'c9-face-07'};
for(const id of ['c9-face-07',null]){source.portraitId=id;for(const convert of [convertRecruitToPlayer,convertWalkonToPlayer]){assert.equal(convert(source,'green-team','test-league').portraitId,id);assert.equal(convert(source,'blue-team','test-league').portraitId,id);}}
assert.equal(validateAndNormalizeRecruitingClass([source]).recruits[0].portraitId,null);
source.portraitId='c9-face-07';assert.equal(validateAndNormalizeRecruitingClass([source]).recruits[0].portraitId,'c9-face-07');
assert.throws(()=>validateAndNormalizeRecruitingClass([{...source,portraitId:'unknown'}]));
console.log('PASS portrait ID validation, null/omitted semantics, saved-template conflicts, signing/walkon team-independent identity, class validation.');
