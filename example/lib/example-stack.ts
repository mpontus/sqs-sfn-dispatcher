import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ExampleStepFunction } from "./example-step-function";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { SqsStepFunctionDispatcher } from "../../lib/index";

export class ExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, "Queue", {
      visibilityTimeout: cdk.Duration.seconds(10),
      fifo: true,
    });

    const sampleStepMachine = new ExampleStepFunction(
      this,
      "SampleStepMachine"
    );

    const dispatcher = new SqsStepFunctionDispatcher(this, "Dispatcher", {
      source: queue,
      target: sampleStepMachine.stateMachine,
    });
  }
}
