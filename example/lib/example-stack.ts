import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ExampleStepFunction } from "./example-step-function";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sqs from "aws-cdk-lib/aws-sqs";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { SqsSfnDispatcher } from "../../lib/index";

/**
 * 0. Singleton step function
 * 1. Shape of input from SQS
 * 2. Invoking different step function for each message
 * 3. Error handling
 * 9. integ tests
 */

export class ExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, "Queue", {
      visibilityTimeout: cdk.Duration.seconds(10),
    });

    const sampleStepMachine = new ExampleStepFunction(
      this,
      "SampleStepMachine"
    );

    const dispatcher = new SqsSfnDispatcher(this, "SqsSfnDispatcher", {
      source: queue,
      target: sampleStepMachine.stateMachine,
    });

    // const role = new iam.Role(this, "Role", {
    //   assumedBy: new iam.ServicePrincipal("pipes.amazonaws.com"),
    // });
    // role.addToPolicy(
    //   new iam.PolicyStatement({
    //     actions: [
    //       "sqs:ReceiveMessage",
    //       "sqs:DeleteMessage",
    //       "sqs:GetQueueAttributes",
    //     ],
    //     resources: [queue.queueArn],
    //   })
    // );
    // role.addToPolicy(
    //   new iam.PolicyStatement({
    //     actions: ["states:StartExecution", "states:StartSyncExecution"],
    //     resources: [dispatcher.stateMachine.stateMachineArn],
    //   })
    // );

    // const logGroup = new logs.LogGroup(this, "LogGroup", {
    //   retention: logs.RetentionDays.TWO_WEEKS,
    // });

    // new CfnPipe(this, "Pipe", {
    //   roleArn: role.roleArn,
    //   source: queue.queueArn,
    //   sourceParameters: {
    //     sqsQueueParameters: {
    //       batchSize: 1,
    //     },
    //   },
    //   target: dispatcher.stateMachine.stateMachineArn,
    //   targetParameters: {
    //     stepFunctionStateMachineParameters: {
    //       invocationType: "FIRE_AND_FORGET",
    //     },
    //   },
    //   logConfiguration: {
    //     cloudwatchLogsLogDestination: {
    //       logGroupArn: logGroup.logGroupArn,
    //     },
    //     includeExecutionData: ["ALL"],
    //     level: "INFO",
    //   },
    // });
  }
}
