import { App, Stack, Duration } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { ExpectedResult, IntegTest, Match } from "@aws-cdk/integ-tests-alpha";
import { SqsSfnDispatcher } from "../lib/sqs-sfn-dispatcher";
import { send } from "process";

const app = new App();
const stack = new Stack(app, "TestStack");

// Create a simple target state machine that just succeeds
const targetStateMachine = new sfn.StateMachine(stack, "TargetStateMachine", {
  definition: new sfn.Succeed(stack, "Success"),
});

// Create source queue
const queue = new sqs.Queue(stack, "SourceQueue", {
  visibilityTimeout: Duration.minutes(5),
});

// Create the dispatcher
const dispatcher = new SqsSfnDispatcher(stack, "Dispatcher", {
  source: queue,
  target: targetStateMachine,
  batchSize: 100,
});

// Create the integration test
const integ = new IntegTest(app, "DispatcherTest", {
  testCases: [stack],
});

const events = new Array(5).fill(0).map((_, i) => ({
  Id: `${i}`,
  MessageBody: JSON.stringify({ data: `message${i}` }),
}));

// Send test messages to the queue
const sendMessages = integ.assertions.awsApiCall("SQS", "sendMessageBatch", {
  QueueUrl: queue.queueUrl,
  Entries: events,
});

sendMessages.provider.addPolicyStatementFromSdkCall("sqs", "sendMessage", [
  queue.queueArn,
]);

const listExecutions = integ.assertions.awsApiCall(
  "StepFunctions",
  "listExecutions",
  {
    stateMachineArn: targetStateMachine.stateMachineArn,
  }
);

// Assert that the number of executions is the same as the number of messages
listExecutions
  .expect(
    ExpectedResult.objectLike({
      executions: events.map((_) => ({
        status: "SUCCEEDED",
      })),
    })
  )
  .waitForAssertions();

sendMessages.next(listExecutions);

app.synth();
