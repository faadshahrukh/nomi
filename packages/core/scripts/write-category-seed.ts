import { writeFileSync } from 'node:fs';
import { categoriesSeedSql } from '../src/defaultCategories';

writeFileSync(new URL('../../../supabase/migrations/20250101000100_system_categories.sql', import.meta.url), categoriesSeedSql());
console.log('wrote supabase/migrations/20250101000100_system_categories.sql');
