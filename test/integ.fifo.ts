import { App, Stack, Duration } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { ExpectedResult, IntegTest } from "@aws-cdk/integ-tests-alpha";
import { SqsStepFunctionDispatcher } from "../lib/sqs-sfn-dispatcher";

const app = new App();
const stack = new Stack(app, "TestStack");

// Create a target state machine that always fails
const targetStateMachine = new sfn.StateMachine(stack, "TargetStateMachine", {
  definition: new sfn.Fail(stack, "Fail"),
});

// Create source FIFO queue
const queue = new sqs.Queue(stack, "SourceQueue", {
  visibilityTimeout: Duration.seconds(30),
  fifo: true,
  contentBasedDeduplication: true,
});

// Create the dispatcher
const dispatcher = new SqsStepFunctionDispatcher(stack, "Dispatcher", {
  source: queue,
  target: targetStateMachine,
});

// Create the integration test
const integ = new IntegTest(app, "DispatcherTest", {
  testCases: [stack],
});

// Create 5 messages with the same group ID
const events = Array.from({ length: 5 }).map((_, i) => ({
  Id: `${i}`,
  MessageBody: JSON.stringify({ number: i }),
  MessageGroupId: `test-group-id`, // Use the same group ID for all messages
}));

// Send messages to the queue
const sendMessages = integ.assertions.awsApiCall("SQS", "sendMessageBatch", {
  QueueUrl: queue.queueUrl,
  Entries: events,
});

sendMessages.provider.addPolicyStatementFromSdkCall("sqs", "sendMessage", [
  queue.queueArn,
]);

// Check failed executions
const listFailedExecutions = integ.assertions.awsApiCall(
  "StepFunctions",
  "listExecutions",
  {
    stateMachineArn: targetStateMachine.stateMachineArn,
    statusFilter: "FAILED",
  }
);
listFailedExecutions.provider.addPolicyStatementFromSdkCall(
  "states",
  "listExecutions",
  [targetStateMachine.stateMachineArn]
);

// Assert that there was only a single execution (which failed)
listFailedExecutions
  .expect(
    ExpectedResult.objectLike({
      executions: [
        {
          status: "FAILED",
        },
      ],
    })
  )
  .waitForAssertions({
    totalTimeout: Duration.minutes(5),
  });

sendMessages.next(listFailedExecutions);

// Check that DLQ contains all messages with matching group id
const getQueueAttributes = integ.assertions.awsApiCall(
  "SQS",
  "getQueueAttributes",
  {
    QueueUrl: queue.queueUrl,
    AttributeNames: ["ApproximateNumberOfMessages"],
  }
);

getQueueAttributes.provider.addPolicyStatementFromSdkCall(
  "sqs",
  "getQueueAttributes",
  [queue.queueArn]
);

getQueueAttributes.expect(
  ExpectedResult.objectLike({
    Attributes: {
      ApproximateNumberOfMessages: `${events.length - 1}`,
    },
  })
);

listFailedExecutions.next(getQueueAttributes);

app.synth();
