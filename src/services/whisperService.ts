import axios from 'axios';

const BASE_URL = '/whisper'; // 替换成实际的Whisper后端API地址

export enum Lang{
  'af', 'am', 'ar', 'as', 'az', 'ba', 'be', 'bg', 'bn', 'bo', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fo', 'fr', 'gl', 'gu', 'ha', 'haw', 'he', 'hi', 'hr', 'ht', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'jw', 'ka', 'kk', 'km', 'kn', 'ko', 'la', 'lb', 'ln', 'lo', 'lt', 'lv', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'nn', 'no', 'oc', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'sa', 'sd', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tk', 'tl', 'tr', 'tt', 'uk', 'ur', 'uz', 'vi', 'yi', 'yo', 'yue', 'zh'
}
export enum OutputType{
  'txt', 'vtt', 'srt', 'tsv', 'json'
}

export interface TranscribeReqBody {
  audioFile: File;
  encode: Boolean;
  task: 'transcribe' | 'translate'
  language?: Lang;
  initialPrompt?: String;
  vadFilter: Boolean;
  wordTimestamps?: Boolean;
  output: OutputType
}

export const transcribeAudio = async (formData:TranscribeReqBody, file:FormData) => {
  try {
    const response = await axios.request({
      url: `${BASE_URL}/asr`, 
      method: 'post',
      data: file, 
      params: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

