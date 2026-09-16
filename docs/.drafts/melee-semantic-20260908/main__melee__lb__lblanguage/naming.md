# Naming Decisions

Retain every current canonical function name. There are no inherited local naming hypotheses, proposed aliases, clears or collisions to resolve.

| Canonical Name | Disposition |
|---|---|
| `lbLang_GetLanguageSetting` | Retain canonical; no alias needed. |
| `lbLang_GetSavedLanguage` | Retain canonical; no alias needed. |
| `lbLang_IsSavedLanguageJP` | Retain canonical; no alias needed. |
| `lbLang_IsSavedLanguageUS` | Retain canonical; no alias needed. |
| `lbLang_IsSettingJP` | Retain canonical; no alias needed. |
| `lbLang_IsSettingUS` | Retain canonical; no alias needed. |
| `lbLang_SetLanguageSetting` | Retain canonical; no alias needed. |
| `lbLang_SetSavedLanguage` | Retain canonical; no alias needed. |

The names distinguish active setting from saved preference and getters from predicates. SetLanguageSetting returns its argument even on rejection; the canonical name is retained and its behavior is documented instead of inventing a replacement. The foreign rendered alias for gmMainLib_8015CC58 is outside TU ownership. Canonical evidence for every decision is in `naming.json`.
