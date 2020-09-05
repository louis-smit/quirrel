import { FastifyPluginCallback } from "fastify";
import * as Queue from "bee-queue";
import * as fastifyBearerAuth from "fastify-bearer-auth";

import * as POSTJobsBodySchema from "../schemas/jobs/POST/body.json";
import { POSTJobsBody } from "../types/jobs/POST/body";
import { HttpJob, HTTP_JOB_QUEUE } from "../../shared/http-job";

interface JobsPluginOpts {
  auth: boolean;
}

const jobs: FastifyPluginCallback<JobsPluginOpts> = (app, opts, done) => {
  if (opts.auth) {
    app.register(fastifyBearerAuth, {
      keys: new Set(["hello"]),
      async auth(key: string) {
        const payload = await app.tokens.check(key);
        return !!payload;
      },
    });
  }

  const jobs = new Queue(HTTP_JOB_QUEUE, {
    redis: app.redis as any,
    isWorker: false,
    getEvents: false,
    sendEvents: false,
    storeJobs: false,
    activateDelayedJobs: true,
  });

  app.post<{ Body: POSTJobsBody }>("/", {
    schema: {
      body: {
        data: POSTJobsBodySchema,
      },
    },

    async handler(request, reply) {
      const { endpoint, body, runAt } = request.body;

      let job = jobs.createJob<HttpJob>({ endpoint, body });

      if (runAt) {
        job = job.delayUntil(new Date(runAt));
      }

      await job.save();

      reply.status(200);
      reply.send("OK");
    },
  });

  app.addHook("onClose", async (instance, done) => {
    await jobs.close();
    done();
  });

  done();
};

export default jobs;
