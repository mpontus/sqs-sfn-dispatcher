import { App, Duration, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { SqsStepFunctionDispatcher } from "../lib";

function createTarget(stack: Stack, id = "Target") {
  return new sfn.StateMachine(stack, id, {
    definitionBody: sfn.DefinitionBody.fromChainable(
      new sfn.Succeed(stack, `${id}Success`)
    ),
  });
}

test("connects a standard queue with partial batch failures and configurable batching", () => {
  const stack = new Stack(new App(), "TestStack");
  const source = new sqs.Queue(stack, "Source");
  const target = createTarget(stack);
  const dispatcher = new SqsStepFunctionDispatcher(stack, "Dispatcher", {
    source,
    target,
    batchSize: 5,
    maxBatchingWindow: Duration.seconds(1),
  });

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::StepFunctions::StateMachine", 2);
  template.resourceCountIs("AWS::Lambda::Function", 1);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs22.x",
    Timeout: 30,
    Environment: {
      Variables: {
        STATE_MACHINE_ARN: stack.resolve(dispatcher.stateMachine.stateMachineArn),
        [`QUEUE_${source.node.addr}`]: stack.resolve(source.queueUrl),
        [`TARGET_${source.node.addr}`]: stack.resolve(target.stateMachineArn),
      },
    },
  });
  template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
    EventSourceArn: stack.resolve(source.queueArn),
    BatchSize: 5,
    MaximumBatchingWindowInSeconds: 1,
    FunctionResponseTypes: ["ReportBatchItemFailures"],
  });
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "states:StartExecution",
          Resource: stack.resolve(target.stateMachineArn),
        }),
        Match.objectLike({
          Action: "sqs:DeleteMessage",
          Resource: stack.resolve(source.queueArn),
        }),
      ]),
    },
  });
});

test("forces FIFO batches to one message even when a larger batch is requested", () => {
  const stack = new Stack(new App(), "TestStack");
  const source = new sqs.Queue(stack, "Source", { fifo: true });
  new SqsStepFunctionDispatcher(stack, "Dispatcher", {
    source,
    target: createTarget(stack),
    batchSize: 10,
  });

  Template.fromStack(stack).hasResourceProperties("AWS::Lambda::EventSourceMapping", {
    EventSourceArn: stack.resolve(source.queueArn),
    BatchSize: 1,
    FunctionResponseTypes: ["ReportBatchItemFailures"],
  });
});

test("reuses the trigger and dispatcher while retaining mappings for both queues", () => {
  const stack = new Stack(new App(), "TestStack");
  const firstSource = new sqs.Queue(stack, "FirstSource");
  const secondSource = new sqs.Queue(stack, "SecondSource");
  const firstTarget = createTarget(stack, "FirstTarget");
  const secondTarget = createTarget(stack, "SecondTarget");
  const first = new SqsStepFunctionDispatcher(stack, "FirstDispatcher", {
    source: firstSource,
    target: firstTarget,
  });
  const second = new SqsStepFunctionDispatcher(stack, "SecondDispatcher", {
    source: secondSource,
    target: secondTarget,
  });

  expect(second.stateMachine).toBe(first.stateMachine);
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::StepFunctions::StateMachine", 3);
  template.resourceCountIs("AWS::Lambda::Function", 1);
  template.resourceCountIs("AWS::Lambda::EventSourceMapping", 2);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: {
      Variables: Match.objectLike({
        [`QUEUE_${firstSource.node.addr}`]: stack.resolve(firstSource.queueUrl),
        [`TARGET_${firstSource.node.addr}`]: stack.resolve(firstTarget.stateMachineArn),
        [`QUEUE_${secondSource.node.addr}`]: stack.resolve(secondSource.queueUrl),
        [`TARGET_${secondSource.node.addr}`]: stack.resolve(secondTarget.stateMachineArn),
      }),
    },
  });
});

test("accepts imported queues and state machines", () => {
  const stack = new Stack(new App(), "TestStack");
  const source = sqs.Queue.fromQueueArn(
    stack, "Source", "arn:aws:sqs:us-east-1:123456789012:source"
  );
  const target = sfn.StateMachine.fromStateMachineArn(
    stack, "Target", "arn:aws:states:us-east-1:123456789012:stateMachine:target"
  );
  new SqsStepFunctionDispatcher(stack, "Dispatcher", { source, target });

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::SQS::Queue", 0);
  template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
  template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
    EventSourceArn: "arn:aws:sqs:us-east-1:123456789012:source",
  });
});
