// EN / 中文: the language switch, in Settings (Appearance) and on the first
// setup step. The option labels are each language's own name, so they read
// the same in both languages.
import { Segmented } from '../ui/common';
import { useLang, type Lang } from './lang';
import { t } from './t';

export function LanguageControl() {
  const { lang, setLang } = useLang();
  return (
    <Segmented<Lang> label={t('Language')} value={lang} onChange={v => { void setLang(v); }}
      options={[{ value: 'en', label: 'EN' }, { value: 'zh', label: '中文' }]} />
  );
}
