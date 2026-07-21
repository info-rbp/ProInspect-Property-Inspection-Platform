import { GoogleGenAI } from '@google/genai';
import { Photo, InspectionItem } from '../types';
import { fileToBase64 } from '../utils';
import { getGeminiApiKey } from './configService';

const GEMINI_MODEL = 'gemini-2.5-flash';

const GLOBAL_RULES = `
1. GLOBAL RULES FOR ALL ITEMS:
   - Object Presence & Visibility: Never default to "not visible" if ANY part is present. Partial view (corner of window, edge of floor) = VISIBLE. Confirm presence and comment on the visible portion.
   - Contextual Reasoning: Infer context. If a shower head is visible, a shower area exists. If a toilet is visible, flooring exists beneath it.
   - Condition Language:
     * Good/Satisfactory: intact, secure, functional, minor marks only.
     * Fair/Minor wear: light scuffs, small chips, aged but functional.
     * Poor/Defective: broken, loose, stained, corroded, unsafe.
   - Evidence Types: Look for surface condition (cracks, peeling), geometry (sagging, gaps), moisture (bubbling, mould), and function (handles, switches).

2. "NOT APPLICABLE" LOGIC:
   - Only use "Not Applicable" if the item is genuinely not in the room.
   - Do NOT use it for "not visible". If likely present but hidden, say: "Not fully visible in provided images; condition cannot be confirmed."

3. LANGUAGE & TONE:
   - Strictly use Australian English spelling and terminology.
   - Tone: Professional, objective, factual, and concise, suitable for a legal property condition report.
`;

const ITEM_GUIDELINES: Record<string, string> = {
  'front door': 'Check surface (dents, cracks, peeling), edges (gaps), hardware (locks, hinges aligned), threshold/seals. Good = solid, aligned. Defect = warping, security issues.',
  'screen door': 'Check mesh (tears, sagging), frame (corrosion, dents), locks/hinges. Good = aligned, mesh intact.',
  walls: 'Check vertical planes. Look for cracks (hairline vs structural), impact damage (holes), stains (moisture/mould), peeling paint. Hairline = cosmetic. Swelling = moisture.',
  flooring: 'Check tiles (cracks, loose grout), carpet (stains, pile wear, fraying), timber (scratches, cupping).',
  ceiling: 'Check for sagging, water stains (yellow/brown rings), mould spots, cornice cracking.',
  windows: 'Check glass (cracks), frames (corrosion, rot), seals (perished), mechanisms (winders/locks). Flyscreens present/intact?',
  'blinds/curtains': 'Check operation (cords, wands), slats (bent, missing), fabric (stains, tears, sun damage).',
  'light fittings': 'Check covers (cracked/missing), bugs/dust inside, bulbs present. Loose fittings?',
  'power points': 'Check covers (cracks, paint splashes), secure mounting. Visibly undamaged?',
  'kitchen benchtop': 'Check edges (chipping, lifting laminate), surface (cuts, burns, swelling at joins). Swelling = water damage.',
  'sink/taps': 'Check stainless steel (scratches, dents), silicone seal (mould, gaps), tap operation (drips if visible).',
  'oven/stove': 'Check glass (clean/intact), elements/burners (corrosion), seals, cleanliness (grease).',
  rangehood: 'Check filters (grease build-up), lights working, fan buttons intact.',
  dishwasher: 'Check seal cleanliness, door spring, control panel legibility.',
  'cupboards/drawers': 'Check hinges (sagging), runners (smooth), laminate condition (peeling/swelling especially near water).',
  shower: 'Check screen (cracks, water stains), silicone (mould, gaps), grout (missing/discoloured), drain (clear).',
  vanity: 'Check cabinet swelling (water damage at base), basin cracks, mirror desilvering.',
  toilet: 'Check bowl (cleanliness), seat (loose/stained), cistern (cracked), base seal.',
  tubs: 'Check for rust spots, cabinet swelling, tap condition.',
  'garage door': 'Check panels (dents), guides (straight), motor unit present.',
  driveway: 'Check concrete/paving (oil stains, cracking, subsidence, weeds).',
  fences: 'Check vertical alignment (leaning), palings (missing/rot).',
  gardens: 'Check weeds, plant health, mulch levels, edging condition.',
  lawns: 'Check coverage (bare patches), weeds, length (overgrown).',
  'smoke alarms': 'Check presence, secure mounting, green light (if visible).',
  'rcd/safety switch': 'Check switchboard presence.',
  pool: 'Check water clarity, surfaces (tiles/liner), equipment (pump/filter). Check fencing and gates for compliance.',
  cpr: 'Check for presence of resuscitation chart, legibility, and visibility within the pool area.',
};

const ensureAiConfigured = (): string => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('AI features are not configured. Add a Gemini API key in Settings before using AI tools.');
  }

  return apiKey;
};

const getGuidelinesForItem = (itemName: string): string => {
  const lowerItem = itemName.toLowerCase();
  for (const [key, guide] of Object.entries(ITEM_GUIDELINES)) {
    if (lowerItem.includes(key) || key.includes(lowerItem)) {
      return guide;
    }
  }

  return 'Assess cleanliness, damage, and working order based on visible evidence.';
};

const getComparisonContext = (file?: File, notes?: string) => {
  if (!file && !notes) {
    return '';
  }

  let instruction = `
    CRITICAL COMPARISON TASK:
    A previous condition report context is provided.
    You MUST compare the visual evidence in the current photos against the description in the previous report.
  `;

  if (file) instruction += '\nA PDF/Image file of the previous report is attached. Refer to it for the previous state of this room.\n';
  if (notes) instruction += `\nRelevant notes from the previous report: "${notes.slice(0, 2000)}". Use these text notes as the baseline for comparison.\n`;

  instruction += `
    - Identify any new damage, wear, or deterioration.
    - Identify any repairs or improvements made since the last report.
    - If the previous report mentions a defect and it is still visible, note that it remains.
    - If the previous report says 'Clean' but photos show it dirty, highlight the degradation.
  `;

  return instruction;
};

const parseJsonResponse = <T>(text: string): T => {
  const cleanText = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanText) as T;
};

const callGemini = async (prompt: string, photos: Photo[], previousReportFile?: File): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: ensureAiConfigured() });

  const parts: any[] = await Promise.all(photos.map(async (photo) => {
    const reader = new FileReader();
    return new Promise<any>((resolve) => {
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        resolve({ inlineData: { mimeType: photo.file.type || 'image/jpeg', data: b64 } });
      };
      reader.readAsDataURL(photo.file);
    });
  }));

  if (previousReportFile) {
    const b64 = await fileToBase64(previousReportFile);
    parts.push({ inlineData: { mimeType: previousReportFile.type, data: b64 } });
    parts.push({ text: '\n[SYSTEM NOTE]: A previous condition report is attached above. Use it for comparison as requested in the prompt.' });
  }

  parts.push({ text: prompt });

  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { role: 'user', parts },
      });

      if (!response.text) {
        throw new Error('Empty response from AI');
      }

      return response.text;
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown AI error');
      if ((message.includes('429') || message.includes('503')) && attempt < 2) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        continue;
      }

      throw new Error(message);
    }
  }

  throw new Error('AI generation failed after multiple attempts.');
};

export const generateImageTags = async (photo: Photo): Promise<string[]> => {
  const prompt = `
    Analyse this real estate photo. Return a JSON array of up to 4 short tags describing the room type and key features or defects.
    Example: ["Kitchen", "Oven", "Tiled Floor"]
    Only return the JSON array.
  `;

  try {
    return parseJsonResponse<string[]>(await callGemini(prompt, [photo]));
  } catch (error) {
    console.warn('Image tagging failed', error);
    return [];
  }
};

interface BatchItemResult {
  id: string;
  comment: string;
  isClean: boolean;
  isUndamaged: boolean;
  isWorking: boolean;
}

interface BatchRoomResult {
  overallComment: string;
  items: BatchItemResult[];
}

export const discoverRoomItems = async (roomName: string, photos: Photo[]): Promise<BatchItemResult[]> => {
  const prompt = `
    You are an expert Property Manager creating a Condition Report for a room identified as: "${roomName}".

    ${GLOBAL_RULES}

    Task:
    1. Analyse the provided photos of this room.
    2. Identify all structural elements, fixtures, and fittings visible.
    3. For each identified item:
       - Assess its condition based on visible evidence.
       - Determine clean/undamaged/working status.
       - Write a concise, specific comment.

    Output a JSON array of objects:
    [{
      "id": "Standard Item Name",
      "comment": "Description of condition...",
      "isClean": true,
      "isUndamaged": true,
      "isWorking": true
    }]
  `;

  try {
    const results = parseJsonResponse<BatchItemResult[]>(await callGemini(prompt, photos));
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('Item discovery failed', error);
    return [];
  }
};

export const generateOverallComment = async (
  roomName: string,
  photos: Photo[],
  currentComment: string,
  previousReportFile?: File,
  previousReportNotes?: string,
): Promise<string> => {
  const comparisonInstruction = getComparisonContext(previousReportFile, previousReportNotes);

  const prompt = `
    You are an expert Property Manager in Western Australia writing a room general overview for a Form 1 Condition Report.
    Room: "${roomName}".

    ${GLOBAL_RULES}

    ${comparisonInstruction}

    Existing Comment (to refine/append to): "${currentComment}"

    Task:
    1. Analyse the provided photos of this room.
    2. Write or refine a 5-sentence summary paragraph covering overall condition, key positive elements, key defects/issues, functional notes, and presentation.
    3. If an existing comment is provided, merge the new findings into it without repetition.
    ${(previousReportFile || previousReportNotes) ? '4. Explicitly mention changes from the previous report if detected.' : ''}

    Output: return only the paragraph text. No JSON.
  `;

  return await callGemini(prompt, photos, previousReportFile);
};

export const generateItemComment = async (
  itemName: string,
  roomName: string,
  photos: Photo[],
  currentComment: string,
  previousReportFile?: File,
  previousReportNotes?: string,
): Promise<{ comment: string; isClean: boolean; isUndamaged: boolean; isWorking: boolean }> => {
  const guidelines = getGuidelinesForItem(itemName);
  const comparisonInstruction = getComparisonContext(previousReportFile, previousReportNotes);

  const prompt = `
    You are an expert Property Manager writing a specific item comment for a Form 1 Condition Report.
    Room: "${roomName}"
    Item: "${itemName}"

    Specific Inspection Guidelines for this item:
    "${guidelines}"

    ${GLOBAL_RULES}

    ${comparisonInstruction}

    Existing Comment: "${currentComment}"

    Task:
    1. Analyse the photos specifically looking for the item "${itemName}".
    2. Determine whether the item is clean, undamaged, and working based on visible evidence.
    3. Write or refine a concise comment. If comparing, explicitly note any change from the previous report.

    Output strictly valid JSON:
    {
      "comment": "The text commentary...",
      "isClean": true,
      "isUndamaged": true,
      "isWorking": true
    }
  `;

  try {
    return parseJsonResponse(await callGemini(prompt, photos, previousReportFile));
  } catch (error) {
    console.error('Item comment generation failed', error);
    return {
      comment: currentComment || 'AI analysis failed for this item.',
      isClean: true,
      isUndamaged: true,
      isWorking: true,
    };
  }
};

export const generateBatchRoomAnalysis = async (
  roomName: string,
  photos: Photo[],
  items: InspectionItem[],
  currentOverallComment: string,
  previousReportFile?: File,
  previousReportNotes?: string,
): Promise<BatchRoomResult> => {
  const itemListStr = items.map((item) => `- ${item.name} (Current: "${item.comment || 'None'}")`).join('\n');
  const comparisonInstruction = getComparisonContext(previousReportFile, previousReportNotes);

  const prompt = `
    You are an expert Property Manager automating a condition report for: "${roomName}".

    ${GLOBAL_RULES}

    ${comparisonInstruction}

    Existing Room Overview: "${currentOverallComment}"

    Items to inspect:
    ${itemListStr}

    Task:
    1. Update the room overview by merging new findings with existing text.
    2. For each listed item, assess visibility, clean/undamaged/working status, and return an updated comment.

    Output strictly valid JSON using this schema:
    {
      "overallComment": "The updated paragraph...",
      "items": [
        {
          "id": "Exact Item Name from list",
          "comment": "Updated comment...",
          "isClean": true,
          "isUndamaged": true,
          "isWorking": true
        }
      ]
    }
  `;

  try {
    return parseJsonResponse<BatchRoomResult>(await callGemini(prompt, photos, previousReportFile));
  } catch (error) {
    console.error('Batch room analysis failed', error);
    return {
      overallComment: currentOverallComment,
      items: [],
    };
  }
};
