FROM node:22.18.0-alpine3.22

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app
COPY --chown=node:node clamd-client.mjs server.mjs ./

USER node
EXPOSE 8787

CMD ["node", "server.mjs"]
