import {PROJECT,REGION,QUEUE,requireProject} from '../core/config.mjs';
export class CloudTasks {
 constructor(functions,project){requireProject(project);this.queue=functions.taskQueue(`locations/${REGION}/functions/${QUEUE}`);}
 async enqueue(job){requireProject(job.payload.project);try{await this.queue.enqueue(job.payload,{id:job.id,scheduleTime:new Date(job.runAtMs),dispatchDeadlineSeconds:60});}catch(error){if(!['functions/task-already-exists','ALREADY_EXISTS',6].includes(error.code))throw error;}}
}
