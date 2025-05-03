import { App, Stack, Duration } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { ExpectedResult, IntegTest, Match } from "@aws-cdk/integ-tests-alpha";
import { SqsSfnDispatcher } from "../lib/sqs-sfn-dispatcher";

const app = new App();
const stack = new Stack(app, "TestStack");

// Create a simple target state machine that just succeeds
const targetStateMachine = new sfn.StateMachine(stack, "TargetStateMachine", {
  definition: new sfn.Succeed(stack, "Success"),
});

// Create source queue
const queue = new sqs.Queue(stack, "SourceQueue", {
  visibilityTimeout: Duration.seconds(30),
});

// Create the dispatcher
const dispatcher = new SqsSfnDispatcher(stack, "Dispatcher", {
  source: queue,
  target: targetStateMachine,
});

// Create the integration test
const integ = new IntegTest(app, "DispatcherTest", {
  testCases: [stack],
});

const events = new Array(10).fill(0).map((_, i) => ({
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

// Start the dispatcher state machine
const startExecution = integ.assertions.awsApiCall(
  "StepFunctions",
  "startExecution",
  {
    stateMachineArn: dispatcher.stateMachine.stateMachineArn,
  }
);
const describeExecution = integ.assertions
  .awsApiCall("StepFunctions", "describeExecution", {
    executionArn: startExecution.getAttString("executionArn"),
  })
  .expect(
    ExpectedResult.objectLike({
      status: "SUCCEEDED",
    })
  )
  .waitForAssertions({
    totalTimeout: Duration.minutes(1),
  });

startExecution.next(describeExecution);

const listExecutions = integ.assertions.awsApiCall(
  "StepFunctions",
  "listExecutions",
  {
    stateMachineArn: targetStateMachine.stateMachineArn,
  }
);

// Assert that the number of executions is the same as the number of messages
listExecutions.expect(
  ExpectedResult.objectLike({
    executions: events.map((_) => ({
      status: "SUCCEEDED",
    })),
  })
);

describeExecution.next(listExecutions);

// // Chain the assertions
// sendMessages.next(startExecution);

// // Verify queue is empty after processing
// integ.assertions
//   .awsApiCall("SQS", "getQueueAttributes", {
//     QueueUrl: queue.queueUrl,
//     AttributeNames: ["ApproximateNumberOfMessages"],
//   })
//   .expect(
//     ExpectedResult.objectLike({
//       Attributes: {
//         ApproximateNumberOfMessages: "0",
//       },
//     })
//   );

// app.synth();
