import fastify from 'fastify';
import { z } from 'zod'
import { sql } from './lib/postgres';
import postgres from 'postgres';
import { redis } from './lib/redis';

const app = fastify();

app.get('/:code', async (request, reply) => {
    const getLinkSchema = z.object({
        code: z.string().min(3),
    });
    
    const { code } = getLinkSchema.parse(request.params);
    const result = await sql/*sql*/`
    SELECT id, original_url 
    FROM short_links
    WHERE short_links.code = ${code}
    `;
    
    if (result.length === 0) {
        return reply.status(400).send({
            error: 'Link not found',
        });
    }
    const link = result[0];

    await redis.zIncrBy('metrics', 1, String(link.id))
    
    return reply.redirect(301, link.original_url)
});

app.get('/api/links', async () => {
    const results = await sql/*sql*/`
    SELECT * FROM short_links
    `;
    return results;
});



app.post('/api/links', async (request, reply) => {

    try {

        const createLinkSchema = z.object({
            code: z.string().min(3),
            url: z.string().url(),
        })
        
        const { code, url } = createLinkSchema.parse(request.body);
    
        const result = await sql/*sql*/`
        INSERT INTO short_links (code, original_url)
        VALUES (${code}, ${url})
        RETURNING id
        `;
        
        const link = result[0];
    
        return reply.status(201).send({
            shortLinkId: link.id,
        });
        
    } catch (error) {
        if (error instanceof postgres.PostgresError) {
            if (error.code === '23505') {
                return reply.status(400).send({
                    error: 'Code already in use',
                });
            }
        }
        return reply.status(500).send({
            error: 'Internal Error',
        });
    }
})

app.get('/api/metrics', async () => {
    const results = await redis.zRangeByScoreWithScores('metrics', 0, 50)
    
    const metrics = results.sort((a, b) => b.score - a.score).map((result) => {
        return {
            shortLinkId: result.value,
            clicks: result.score,
        }
    })
        
    return metrics;
});


app.listen({
    port:3000,
}).then(() => {
    console.log("Server is running on port 3000");
});