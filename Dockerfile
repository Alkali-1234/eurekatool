# FPS Runner: Next.js GUI (web/) + the Python builders, in one image.
#   docker compose up --build        then open http://<host>:3000
# Task data (runs, uploads) lives in the /data volume.

# ---- 1) Next.js standalone build
FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2) Python venv (full image has compilers in case a wheel is missing)
FROM python:3.13-bookworm AS py
COPY requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# ---- 3) Runtime: slim Python + the node binary
FROM python:3.13-slim-bookworm
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=py /opt/venv /opt/venv
WORKDIR /app
COPY fps_ref.py rstar_builder.py umax_table_builder.py waveform_tool.py ./
COPY fps_common/ ./fps_common/
COPY data/ ./data/
COPY ["indonesia_raw_waveforms (1)/raw", "./indonesia_raw_waveforms (1)/raw"]
COPY severe_records/raw ./severe_records/raw
COPY --from=web /src/web/.next/standalone ./web/
COPY --from=web /src/web/.next/static ./web/.next/static
COPY --from=web /src/web/public ./web/public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 \
    FPS_ROOT=/app FPS_PYTHON=/opt/venv/bin/python FPS_DATA=/data MPLBACKEND=Agg
VOLUME /data
EXPOSE 3000
CMD ["node", "/app/web/server.js"]
