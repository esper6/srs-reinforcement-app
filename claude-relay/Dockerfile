FROM node:20-slim

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3100

# Note: Claude Code CLI must be authenticated before first use.
# After deploying, run `claude auth login` in the container,
# or mount a volume with pre-existing auth at ~/.claude/
CMD ["node", "dist/index.js"]
