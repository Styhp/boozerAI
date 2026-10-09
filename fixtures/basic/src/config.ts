import { z } from 'zod';

const schema = z.object({ outputDir: z.string(), currency: z.string() });

export default schema.parse({ outputDir: 'out', currency: 'AUD' });
