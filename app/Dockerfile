FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js storage.js ./
COPY data ./data
COPY public ./public
ENV NODE_ENV=production
ENV PORT=3000
ENV ATLAS_DATA_DIR=/var/data
RUN mkdir -p /var/data && chown -R node:node /app /var/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
