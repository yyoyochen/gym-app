// Import and restore messages, English template → Chinese. They are built in
// db/backup.ts and import/*.ts (kept English there: tests and logs read them)
// and translated where they are shown, through te().
import type { Dict } from './types';

const zh: Dict = {
  'Not valid JSON': '不是有效的 JSON 檔',
  'Nothing to undo': '沒有可以復原的動作',
  'Empty CSV': 'CSV 檔是空的',
  'format must be "{f}"': '格式必須是「{f}」',
  'schemaVersion must be a positive integer': 'schemaVersion 必須是正整數',
  'Backup is from a newer app (schema {a} > {b})': '這份備份來自較新版本的 app（schema {a} > {b}），請先更新 app',
  '{store} must be an array': '{store} 必須是陣列',
  '{store}: duplicate key {k}': '{store}：重複的鍵 {k}',
  'profile must hold at most one record with id "me"': 'profile 最多只能有一筆 id 為「me」的資料',
  '{row} is malformed': '{row} 格式錯誤',
  '{row} references missing session {id}': '{row} 指向不存在的訓練 {id}',
  'No migration from backup schema {v}': '無法轉換 schema {v} 的備份',
  'Missing required column "{col}" (found: {found})': '缺少必要欄位「{col}」（找到：{found}）',
  'The app reads three kinds of CSV: its own template (Date, Session, Exercise, Order, Set, Reps, Weight (kg), Notes), a Hevy export, or a Strong export. This file is none of them.':
    'app 讀得懂三種 CSV：自己的範本（Date, Session, Exercise, Order, Set, Reps, Weight (kg), Notes）、Hevy 匯出檔、Strong 匯出檔。這個檔案都不是。',
  'This Strong file does not say whether weights are in kg or lb. Choose one, then import.': '這個 Strong 檔沒有標示重量單位是 kg 還是 lb。選一個，再匯入。',
  'Alias file must be {"aliases": {"raw": "canonical"}}': '別名檔必須是 {"aliases": {"raw": "canonical"}} 的格式',
  'unreadable date "{d}"': '日期無法讀取「{d}」',
  'no exercise': '沒有動作名稱',
  'no reps (timed or cardio)': '沒有次數（計時或有氧）',
  'unreadable weight or reps': '重量或次數無法讀取',
  'unreadable {col} "{v}"': '{col} 無法讀取「{v}」',
};
export default zh;
