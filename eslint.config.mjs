import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("next/typescript"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    // UCFitness プロジェクト固有の禁止ルール
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "framer-motion",
              message:
                "framer-motion は禁止されています。CSS アニメーション + Tailwind を使用してください (copilot-instructions.md)。",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert|prompt)$/]",
          message:
            "window.confirm/alert/prompt は禁止です。createPortal でカスタムダイアログを実装してください (copilot-instructions.md)。",
        },
      ],
    },
  },
];

export default eslintConfig;
