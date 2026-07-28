export default async function handler(req, res) {
  // CORS & HTTP Method Check
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Only POST is supported.' });
  }

  const apiKey = process.env.G_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 G_API_KEY 환경 변수가 설정되지 않았습니다.' });
  }

  const { image, mimeType } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: '분석할 이미지 데이터가 누락되었습니다.' });
  }

  // Use Gemini 3 Flash Preview model for rapid multimodal vision analysis
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const promptText = `
너는 학교 및 기업 급식을 전문적으로 분석하는 대한민국 수석 영양사 AI야.
제공된 급식 사진을 정밀하게 분석해서 아래 JSON 형식으로 응답해줘.

JSON 응답 요구사항:
1. mealName: 식단의 전체적인 이름 (예: "제육볶음과 미역국 급식")
2. items: 감지된 각 반찬/밥/국/후식의 배열
   - name: 음식 이름
   - calories: 예상 칼로리 (숫자, kcal)
   - carbsG: 탄수화물 (g, 숫자)
   - proteinG: 단백질 (g, 숫자)
   - fatG: 지방 (g, 숫자)
   - healthTag: 한 단어 건강 평가 (예: "단백질풍부", "고칼로리", "영양균형", "비타민풍부")
3. totalCalories: 총 예상 칼로리 (숫자)
4. totalCarbsG: 총 탄수화물 (g, 숫자)
5. totalProteinG: 총 단백질 (g, 숫자)
6. totalFatG: 총 지방 (g, 숫자)
7. healthScore: 종합 건강/영양 점수 (0 ~ 100 사이의 숫자)
8. healthComment: 총평 및 친절한 AI 영양 코치 코멘트 (2~3문장)
9. improvements: 식단을 보완할 수 있는 실천 가능한 영양 팁 2~3개 (문자열 배열)

반드시 순수 JSON 형식으로만 응답해야 하며, 마크다운 코드블록(\`\`\`json)을 포함시키지 말아줘.
`;

  try {
    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('Gemini API Error:', errorText);
      return res.status(apiResponse.status).json({
        error: `Gemini API 호출 실패 (${apiResponse.status}): ${errorText}`
      });
    }

    const result = await apiResponse.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      return res.status(500).json({ error: 'Gemini API로부터 응답 텍스트를 받지 못했습니다.' });
    }

    // Parse JSON string
    let parsedData;
    try {
      // Clean up markdown markers if present
      const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error('JSON Parsing Error:', parseError, responseText);
      return res.status(500).json({
        error: 'AI 응답을 JSON 형식으로 변환하는데 실패했습니다.',
        rawText: responseText
      });
    }

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
  }
}